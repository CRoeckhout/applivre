import ActivityKit
import ExpoModulesCore
import UIKit

public class LiveActivityModule: Module {
  private var activity: Any?

  // Pointers Darwin pour pouvoir add/remove proprement les observers.
  // Stockés ici pour qu'OnDestroy puisse les retirer (sinon callbacks dangling).
  private var pauseObserverPtr: UnsafeMutableRawPointer?
  private var resumeObserverPtr: UnsafeMutableRawPointer?

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

    Events("onPause", "onResume")

    OnCreate {
      self.registerDarwinObservers()
    }

    OnDestroy {
      self.unregisterDarwinObservers()
    }

    Function("isAvailable") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // True si une Live Activity tourne côté OS. Utilisé au relaunch
    // pour appeler update() (adoption) plutôt que start() (et éviter
    // un blink visuel dû à end+recreate).
    Function("hasActive") { () -> Bool in
      if #available(iOS 16.2, *) {
        return !Activity<ReadingActivityAttributes>.activities.isEmpty
      }
      return false
    }

    AsyncFunction("start") { (args: [String: Any], promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      let title = args["bookTitle"] as? String ?? ""
      let author = args["bookAuthor"] as? String ?? ""
      let isbn = args["bookIsbn"] as? String ?? ""
      let coverUrl = args["bookCoverUrl"] as? String
      let startedAtMs = (args["startedAtMs"] as? NSNumber)?.doubleValue
        ?? Date().timeIntervalSince1970 * 1000
      let startedAt = Date(timeIntervalSince1970: startedAtMs / 1000)

      Task {
        // End ALL — kill défensif des doublons. Cas : kill+relaunch de l'app
        // laisse une Activity orpheline côté OS, sinon on empile.
        for current in Activity<ReadingActivityAttributes>.activities {
          await current.end(nil, dismissalPolicy: .immediate)
        }
        self.activity = nil

        // Téléchargement et resize du cover AVANT request : on embarque les
        // bytes directement dans les attributes (le widget n'a pas d'accès
        // réseau fiable). Si l'URL est absente, indisponible ou que les
        // bytes dépassent le budget, on continue sans cover (fallback icône).
        var coverData: Data? = nil
        if let urlString = coverUrl, let url = URL(string: urlString) {
          coverData = await Self.downloadAndResizeCover(url: url)
        }

        let attributes = ReadingActivityAttributes(
          bookTitle: title,
          bookAuthor: author,
          bookIsbn: isbn,
          bookCoverData: coverData
        )
        let state = ReadingActivityAttributes.ContentState(
          startedAt: startedAt,
          isPaused: false,
          pausedAt: nil
        )

        do {
          let activity = try Activity<ReadingActivityAttributes>.request(
            attributes: attributes,
            content: .init(state: state, staleDate: nil)
          )
          self.activity = activity
          promise.resolve(nil)
        } catch {
          promise.reject("LIVE_ACTIVITY_START", error.localizedDescription)
        }
      }
    }

    // Push de l'état souhaité à l'Activity. Source unique d'update côté JS :
    // appelé par le store timer pour pause/resume/adopt-on-relaunch.
    AsyncFunction("update") { (args: [String: Any], promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      let startedAtMs = (args["startedAtMs"] as? NSNumber)?.doubleValue
        ?? Date().timeIntervalSince1970 * 1000
      let startedAt = Date(timeIntervalSince1970: startedAtMs / 1000)
      let isPaused = args["isPaused"] as? Bool ?? false
      let pausedAt: Date? = (args["pausedAtMs"] as? NSNumber).map {
        Date(timeIntervalSince1970: $0.doubleValue / 1000)
      }
      let state = ReadingActivityAttributes.ContentState(
        startedAt: startedAt,
        isPaused: isPaused,
        pausedAt: pausedAt
      )

      Task {
        await Self.defendSingleton()
        // Toujours re-fetcher l'instance live depuis Activity.activities plutôt
        // que d'utiliser self.activity en cache : un snapshot conservé peut
        // pointer sur une activity ended (defendSingleton vient peut-être de
        // la tuer) ou détachée du système — activity.update() partirait alors
        // dans le vide.
        let activities = Activity<ReadingActivityAttributes>.activities
        guard let activity = activities.first else {
          promise.resolve(nil)
          return
        }
        self.activity = activity
        await activity.update(.init(state: state, staleDate: nil))
        promise.resolve(nil)
      }
    }

    AsyncFunction("end") { (promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      Task {
        for current in Activity<ReadingActivityAttributes>.activities {
          await current.end(nil, dismissalPolicy: .immediate)
        }
        self.activity = nil
        promise.resolve(nil)
      }
    }
  }

  // MARK: - Singleton defense
  //
  // Garantit qu'au plus une Activity tourne. Cas où on peut empiler : crash
  // JS pendant `start`, double tap, race entre intent et start. On garde la
  // plus récente (max startedAt) et on end les autres immédiatement.
  @available(iOS 16.2, *)
  private static func defendSingleton() async {
    let activities = Activity<ReadingActivityAttributes>.activities
    guard activities.count > 1 else { return }
    let sorted = activities.sorted { $0.content.state.startedAt > $1.content.state.startedAt }
    for activity in sorted.dropFirst() {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }

  // MARK: - Darwin notifications (pause/resume signals from Live Activity)
  //
  // Architecture deux-writers (cf. ReadingActivityActionIntents.swift) :
  //   1. Le LiveActivityIntent fait un update best-effort depuis le widget
  //      process — critique car les updates faites par l'app en background
  //      sont throttled par iOS.
  //   2. L'intent poste cette Darwin notif. On la forwarde à JS qui pousse
  //      une seconde update par-dessus avec la math autoritaire (calculée
  //      localement) — rectifie les cas où l'intent a fait un read stale.

  private static let pauseDarwinName = "com.corentin.grimolia.liveactivity.pause"
  private static let resumeDarwinName = "com.corentin.grimolia.liveactivity.resume"

  private func registerDarwinObservers() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()

    // Le callback C ne capture pas self → on passe un opaque pointer vers
    // le module et on le récupère dans le callback. `passUnretained` car
    // on garde nous-mêmes le ptr et on le libère dans OnDestroy via remove.
    let modulePtr = Unmanaged.passUnretained(self).toOpaque()
    pauseObserverPtr = modulePtr
    resumeObserverPtr = modulePtr

    // Forward la Darwin notif à JS. Le payload (currentActivityPayload) reflète
    // l'état actuel de l'Activity ; ici l'intent n'a rien muté donc le payload
    // contient l'ancien state (pre-pause/pre-resume) — JS l'ignore et calcule
    // son nouvel état localement à partir de son store + Date.now().
    // Pas de `Self.` ici : un CFNotificationCallback est un C function pointer,
    // qui ne peut pas capturer de Self dynamique. On référence la classe par
    // son nom concret pour que la closure reste @convention(c)-compatible.
    let pauseCallback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer = observer else { return }
      let module = Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
      module.sendEvent("onPause", LiveActivityModule.currentActivityPayload())
    }

    let resumeCallback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer = observer else { return }
      let module = Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
      module.sendEvent("onResume", LiveActivityModule.currentActivityPayload())
    }

    CFNotificationCenterAddObserver(
      center, modulePtr, pauseCallback,
      Self.pauseDarwinName as CFString, nil, .deliverImmediately
    )
    CFNotificationCenterAddObserver(
      center, modulePtr, resumeCallback,
      Self.resumeDarwinName as CFString, nil, .deliverImmediately
    )
  }

  // Snapshot du ContentState pour passer le timestamp natif à JS.
  //   - pause : `pausedAtMs` = instant exact du tap (set par l'intent).
  //   - resume : `virtualStartMs` = startedAt déjà avancé de pausedDuration
  //     par l'intent → JS peut déduire accumulatedPausedMs = vsMs - wallStart.
  //
  // On prend l'Activity au startedAt le plus récent : si un doublon a survécu
  // un instant à defendSingleton, c'est celui qui a été mis à jour en dernier
  // par le controller (donc le « bon » payload).
  private static func currentActivityPayload() -> [String: Any] {
    guard #available(iOS 16.2, *) else { return [:] }
    let activities = Activity<ReadingActivityAttributes>.activities
    guard let activity = activities.max(by: {
      $0.content.state.startedAt < $1.content.state.startedAt
    }) else {
      return [:]
    }
    let state = activity.content.state
    var payload: [String: Any] = [
      "virtualStartMs": state.startedAt.timeIntervalSince1970 * 1000,
      "isPaused": state.isPaused,
    ]
    if let pausedAt = state.pausedAt {
      payload["pausedAtMs"] = pausedAt.timeIntervalSince1970 * 1000
    }
    return payload
  }

  // MARK: - Cover download / resize
  //
  // Budget ActivityKit = 4 Ko (attributes + state combinés, JSON encodé).
  // Data sera base64-encodé par Codable → +33%. On vise 2,7 Ko de bytes JPEG
  // max (≈ 3,6 Ko en base64) + ~300 octets pour le reste des attributes.
  //
  // 120pt en pixels physiques (scale 1) couvre le cas pire 36pt × 3x du
  // lock-screen (= 108 px) avec une marge — pas d'upscale visible.
  // Si JPEG q=0.5 dépasse le budget, on retombe sur des qualités plus basses
  // plutôt que d'écarter le cover entièrement.
  private static let coverMaxDimension: CGFloat = 120
  private static let coverJpegQualities: [CGFloat] = [0.55, 0.4, 0.25]
  private static let coverMaxBytes = 2700
  private static let coverDownloadTimeout: TimeInterval = 3

  private static func downloadAndResizeCover(url: URL) async -> Data? {
    var request = URLRequest(url: url)
    request.timeoutInterval = coverDownloadTimeout
    do {
      let (data, _) = try await URLSession.shared.data(for: request)
      guard let image = UIImage(data: data) else { return nil }
      guard let resized = resizeImage(image, maxDimension: coverMaxDimension) else { return nil }
      for quality in coverJpegQualities {
        if let jpeg = resized.jpegData(compressionQuality: quality), jpeg.count <= coverMaxBytes {
          return jpeg
        }
      }
      return nil
    } catch {
      return nil
    }
  }

  private static func resizeImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage? {
    let originalSize = image.size
    let largest = max(originalSize.width, originalSize.height)
    guard largest > 0 else { return nil }
    let scale = min(1.0, maxDimension / largest)
    let newSize = CGSize(width: originalSize.width * scale, height: originalSize.height * scale)
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1 // pixels logiques = pixels physiques pour minimiser la taille
    let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: newSize))
    }
  }

  private func unregisterDarwinObservers() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    if let ptr = pauseObserverPtr {
      CFNotificationCenterRemoveObserver(
        center, ptr,
        CFNotificationName(Self.pauseDarwinName as CFString),
        nil
      )
      pauseObserverPtr = nil
    }
    if let ptr = resumeObserverPtr {
      CFNotificationCenterRemoveObserver(
        center, ptr,
        CFNotificationName(Self.resumeDarwinName as CFString),
        nil
      )
      resumeObserverPtr = nil
    }
  }
}
