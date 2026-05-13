import AppIntents
import Foundation

// LiveActivityIntent (iOS 17+) déclenchés par les boutons de la Live
// Activity. S'exécutent dans le process du widget (ou de l'app si elle est
// en foreground) → pas d'ouverture de l'app contrairement aux Link.
//
// La logique : on ne mute PAS l'Activity ici (l'app principale est seule
// source de vérité du timer). On post une Darwin notification que le
// LiveActivityModule.swift de l'app principale observe et forwarde à JS
// via Events. JS appelle alors useTimer.pause()/resume() qui déclenche un
// updateReadingActivity, ce qui synchronise le widget.
//
// Trade-off : petit délai (~50-100ms) entre le tap et l'update visuel
// du widget, le temps que l'aller-retour Darwin → JS → ActivityKit se
// fasse. Acceptable. Évite les états divergents entre le widget et le
// store JS.

@available(iOS 17.0, *)
struct PauseReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mettre en pause la lecture"

  func perform() async throws -> some IntentResult {
    DarwinNotifications.post(name: DarwinNotifications.pauseName)
    return .result()
  }
}

@available(iOS 17.0, *)
struct ResumeReadingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Reprendre la lecture"

  func perform() async throws -> some IntentResult {
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
