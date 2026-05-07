package expo.modules.grimolia.liveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Receiver pour les broadcasts envoyés par les boutons de la notification.
// Forwarde l'action au LiveActivityModule qui la dispatche à JS via event.
//
// Si le process JS est mort (Module.instance = null), l'action est perdue —
// acceptable pour MVP : le foreground service garde l'app viable la plupart
// du temps, et le bouton Stop ouvre l'app via deep link en backup.
class ReadingActivityActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = when (intent.action) {
      ReadingActivityService.ACTION_PAUSE -> "onPause"
      ReadingActivityService.ACTION_RESUME -> "onResume"
      else -> return
    }
    LiveActivityModule.dispatchEvent(event)
  }
}
