import MediaPlayer
import ExpoModulesCore

// expo-audio (1.1.x) ne registre pas nextTrackCommand / previousTrackCommand
// sur MPRemoteCommandCenter — donc le widget Now Playing affiche les boutons
// skip prev/next en gris. Ce module les enregistre nous-mêmes et forwarde les
// taps vers JS via des events. La lib expo-audio reste responsable du player
// et de play/pause/seek ; on se contente de combler le trou des skips.
public class MediaRemoteCommandsModule: Module {
  // Targets retournés par addTarget — gardés pour pouvoir les retirer
  // proprement dans disable() / OnDestroy. Sans ça, des targets s'empileraient
  // à chaque appel d'enable et on se retrouverait avec plusieurs sendEvent
  // par tap.
  private var nextTarget: Any?
  private var previousTarget: Any?

  public func definition() -> ModuleDefinition {
    Name("MediaRemoteCommandsModule")

    Events("onNext", "onPrevious")

    Function("enable") {
      let center = MPRemoteCommandCenter.shared()

      if let target = self.nextTarget {
        center.nextTrackCommand.removeTarget(target)
      }
      if let target = self.previousTarget {
        center.previousTrackCommand.removeTarget(target)
      }

      let next = center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onNext", [:])
        return .success
      }
      self.nextTarget = next
      center.nextTrackCommand.isEnabled = true

      let prev = center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPrevious", [:])
        return .success
      }
      self.previousTarget = prev
      center.previousTrackCommand.isEnabled = true
    }

    Function("disable") {
      let center = MPRemoteCommandCenter.shared()
      if let target = self.nextTarget {
        center.nextTrackCommand.removeTarget(target)
        self.nextTarget = nil
      }
      if let target = self.previousTarget {
        center.previousTrackCommand.removeTarget(target)
        self.previousTarget = nil
      }
      center.nextTrackCommand.isEnabled = false
      center.previousTrackCommand.isEnabled = false
    }

    OnDestroy {
      let center = MPRemoteCommandCenter.shared()
      if let target = self.nextTarget {
        center.nextTrackCommand.removeTarget(target)
        self.nextTarget = nil
      }
      if let target = self.previousTarget {
        center.previousTrackCommand.removeTarget(target)
        self.previousTarget = nil
      }
    }
  }
}
