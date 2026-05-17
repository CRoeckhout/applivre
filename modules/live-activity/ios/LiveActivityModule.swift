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
        // Ferme TOUTES les activities existantes de ce type côté OS,
        // pas seulement celle qu'on connaît via self.activity. Cas clé :
        // après kill + relaunch de l'app, self.activity est nil quand
        // l'ancienne activity tourne encore sur iOS → empile des doublons.
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
        // Adopte l'activity existante si le module a été recréé.
        if self.activity == nil {
          self.activity = Activity<ReadingActivityAttributes>.activities.first
        }
        guard let activity = self.activity as? Activity<ReadingActivityAttributes> else {
          promise.resolve(nil)
          return
        }
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
        // End ALL — même raison que start : doublons OS possibles.
        for current in Activity<ReadingActivityAttributes>.activities {
          await current.end(nil, dismissalPolicy: .immediate)
        }
        self.activity = nil
        promise.resolve(nil)
      }
    }
  }

  // MARK: - Darwin notifications (instant pause/resume from Live Activity)
  //
  // Les LiveActivityIntent du widget (iOS 17+) postent une Darwin notification
  // quand l'utilisateur tape pause/resume. On l'intercepte ici pour la
  // forwarder à JS via Events. Le hook JS applique alors timer.pause/resume,
  // et useReadingLiveActivity → update() → resync de l'Activity côté OS.

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

    // Les LiveActivityIntents ont déjà muté l'Activity côté OS avec un
    // timestamp natif capturé au tap (cf. ReadingActivityActionIntents).
    // Quand le device était verrouillé, ces callbacks ne tournent qu'au
    // déverouillage — on lit l'état persisté de l'Activity pour récupérer
    // le timestamp réel du tap au lieu d'utiliser Date.now() côté JS.
    let pauseCallback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer = observer else { return }
      let module = Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
      module.sendEvent("onPause", Self.currentActivityPayload())
    }

    let resumeCallback: CFNotificationCallback = { _, observer, _, _, _ in
      guard let observer = observer else { return }
      let module = Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue()
      module.sendEvent("onResume", Self.currentActivityPayload())
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

  // Snapshot du ContentState courant pour passer le timestamp natif à JS.
  //   - pause : `pausedAtMs` = instant exact du tap (set par l'intent).
  //   - resume : `virtualStartMs` = startedAt déjà avancé de pausedDuration
  //     par l'intent → JS peut déduire accumulatedPausedMs = vsMs - wallStart.
  private static func currentActivityPayload() -> [String: Any] {
    guard #available(iOS 16.2, *) else { return [:] }
    guard let activity = Activity<ReadingActivityAttributes>.activities.first else {
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
