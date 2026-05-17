import ActivityKit
import AppIntents
import Foundation

// LiveActivityIntent (iOS 17+) déclenchés par les boutons de la Live
// Activity. S'exécutent dans le process du widget (ou de l'app si elle est
// en foreground) → pas d'ouverture de l'app contrairement aux Link.
//
// Important : on met à jour le ContentState de l'Activity DIRECTEMENT ici
// avec un timestamp `Date()` capturé à l'instant du tap. Raison : si le
// device est verrouillé, le process JS de l'app est suspendu et le Darwin
// notification observer ne firera qu'au déverouillage. Sans update local,
// la Live Activity afficherait encore le timer qui tourne (ou qui tournerait
// encore après resume) jusqu'à ce que JS réveille — feedback cassé.
//
// L'app principale est ensuite notifiée via la Darwin notification (queuée
// par l'OS si l'app dort). Quand JS se réveille, il lit le ContentState
// déjà à jour (pausedAt côté pause, startedAt avancé côté resume) pour
// réconcilier le store avec le timestamp natif du tap au lieu de Date.now().

@available(iOS 17.0, *)
struct PauseReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mettre en pause la lecture"

  func perform() async throws -> some IntentResult {
    let now = Date()
    if #available(iOS 16.2, *) {
      for activity in Activity<ReadingActivityAttributes>.activities {
        let state = activity.content.state
        guard !state.isPaused else { continue }
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

  func perform() async throws -> some IntentResult {
    let now = Date()
    if #available(iOS 16.2, *) {
      for activity in Activity<ReadingActivityAttributes>.activities {
        let state = activity.content.state
        guard state.isPaused, let pausedAt = state.pausedAt else { continue }
        let pausedDuration = now.timeIntervalSince(pausedAt)
        // Avance le virtual startedAt de la durée de pause pour que
        // Text(timerInterval:) reprenne l'elapsed pile où il s'était figé.
        let newStartedAt = state.startedAt.addingTimeInterval(pausedDuration)
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
