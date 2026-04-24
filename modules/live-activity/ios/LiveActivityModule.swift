import ActivityKit
import ExpoModulesCore

public class LiveActivityModule: Module {
  private var activity: Any?

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

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
      let startedAtMs = (args["startedAtMs"] as? NSNumber)?.doubleValue
        ?? Date().timeIntervalSince1970 * 1000
      let startedAt = Date(timeIntervalSince1970: startedAtMs / 1000)

      Task {
        // Ferme TOUTES les activities existantes de ce type côté OS,
        // pas seulement celle qu'on connaît via self.activity. Cas clé :
        // après kill + relaunch de l'app, self.activity est nil mais
        // l'ancienne activity tourne encore sur iOS → empile des doublons.
        for current in Activity<ReadingActivityAttributes>.activities {
          await current.end(nil, dismissalPolicy: .immediate)
        }
        self.activity = nil

        let attributes = ReadingActivityAttributes(
          bookTitle: title,
          bookAuthor: author,
          bookIsbn: isbn
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
}
