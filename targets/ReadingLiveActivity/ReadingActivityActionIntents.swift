import ActivityKit
import AppIntents
import Foundation

// LiveActivityIntent (iOS 17+) déclenchés par les boutons de la Live
// Activity. S'exécutent dans le process du widget (ou de l'app si elle est
// en foreground) → pas d'ouverture de l'app contrairement aux Link.
//
// Architecture deux-writers :
//
//   1. L'intent fait un update best-effort de l'Activity DIRECTEMENT depuis
//      le widget process. Critique car les updates faites par l'app en
//      background sont throttled par iOS (économie batterie), alors que les
//      updates du widget process passent toujours immédiatement. C'est le
//      seul moyen fiable de refléter le tap pause/play sur la Live Activity
//      quand l'app dort.
//
//   2. L'intent poste aussi une Darwin notif. JS l'attrape côté app, met
//      à jour son store et pousse une update PAR-DESSUS via
//      updateReadingActivity(). Cette deuxième update porte la math
//      autoritaire (calculée localement en JS avec Date.now() - pausedAt) ce
//      qui rectifie les cas où l'intent a fait un read stale sur l'Activity
//      (typiquement la resume qui a besoin de pausedAt pour avancer
//      startedAt correctement).
//
// Pour la pause, la math est triviale (figer le timer à `now`) donc l'intent
// se suffit à lui-même. Pour la resume, on peut faire un read stale du
// pausedAt → on tente quand même, et JS rectifie. Pire cas : visuel
// légèrement off pendant que JS rattrape.

@available(iOS 17.0, *)
struct PauseReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mettre en pause la lecture"
  // .alwaysAllowed laisse l'intent tourner même device verrouillé. Sans ça,
  // iOS peut demander un déverrouillage avant l'exécution dans certains états.
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

  func perform() async throws -> some IntentResult {
    let now = Date()
    if #available(iOS 16.2, *) {
      for activity in Activity<ReadingActivityAttributes>.activities {
        let state = activity.content.state
        // Overwrite inconditionnel : on ne lit pas state.isPaused (peut être
        // stale cross-process). Si déjà en pause, on rétablit juste pausedAt
        // — pas grave en pratique.
        let newState = ReadingActivityAttributes.ContentState(
          startedAt: state.startedAt,
          isPaused: true,
          pausedAt: now
        )
        await activity.update(.init(state: newState, staleDate: nil))
      }
    }
    DarwinNotifications.post(name: DarwinNotifications.pauseName)
    return .result()
  }
}

@available(iOS 17.0, *)
struct ResumeReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Reprendre la lecture"
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

  func perform() async throws -> some IntentResult {
    let now = Date()
    if #available(iOS 16.2, *) {
      for activity in Activity<ReadingActivityAttributes>.activities {
        let state = activity.content.state
        // Best-effort math : si on a pausedAt, on advance startedAt. Sinon
        // on clear juste isPaused (JS rectifiera la math via son store).
        let newStartedAt: Date
        if let pausedAt = state.pausedAt {
          let pausedDuration = now.timeIntervalSince(pausedAt)
          newStartedAt = state.startedAt.addingTimeInterval(pausedDuration)
        } else {
          newStartedAt = state.startedAt
        }
        let newState = ReadingActivityAttributes.ContentState(
          startedAt: newStartedAt,
          isPaused: false,
          pausedAt: nil
        )
        await activity.update(.init(state: newState, staleDate: nil))
      }
    }
    DarwinNotifications.post(name: DarwinNotifications.resumeName)
    return .result()
  }
}

// Darwin notifications = mécanisme bas niveau Apple pour la communication
// inter-process iOS. Sans payload, juste un nom. CFNotificationCenter relaie
// vers tous les observateurs enregistrés sur le device.
enum DarwinNotifications {
  static let pauseName = "com.corentin.grimolia.liveactivity.pause"
  static let resumeName = "com.corentin.grimolia.liveactivity.resume"

  static func post(name: String) {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let cfName = CFNotificationName(rawValue: name as CFString)
    CFNotificationCenterPostNotification(center, cfName, nil, nil, true)
  }
}
