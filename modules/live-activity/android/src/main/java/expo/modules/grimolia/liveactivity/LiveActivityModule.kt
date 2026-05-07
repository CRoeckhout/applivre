package expo.modules.grimolia.liveactivity

import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// Façade JS du module Live Activity Android. Délègue tout le boulot au
// ReadingActivityService (foreground service) et expose les events
// `onPause` / `onResume` que le BroadcastReceiver dispatch quand l'utilisateur
// tappe les boutons de la notification.
//
// L'API JS (start / update / end / isAvailable / hasActive) est strictement
// identique à la version iOS — le hook useReadingLiveActivity fonctionne sans
// changement.

class LiveActivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveActivityModule")

    Events("onPause", "onResume")

    OnCreate {
      instance = this@LiveActivityModule
    }

    OnDestroy {
      if (instance == this@LiveActivityModule) {
        instance = null
      }
    }

    Function("isAvailable") {
      // Sur Android 13+ il faut POST_NOTIFICATIONS pour que la notif soit
      // visible. On retourne true ici quand même — le hook JS ne bloque rien.
      true
    }

    Function("hasActive") {
      ReadingActivityService.isActive
    }

    AsyncFunction("start") { args: StartArgs ->
      appContext.reactContext?.let { ctx ->
        val intent = Intent(ctx, ReadingActivityService::class.java).apply {
          action = ReadingActivityService.ACTION_START
          putExtra(ReadingActivityService.EXTRA_TITLE, args.bookTitle)
          putExtra(ReadingActivityService.EXTRA_AUTHOR, args.bookAuthor)
          putExtra(ReadingActivityService.EXTRA_ISBN, args.bookIsbn)
          putExtra(ReadingActivityService.EXTRA_COVER_URL, args.bookCoverUrl)
          putExtra(ReadingActivityService.EXTRA_STARTED_AT, args.startedAtMs.toLong())
        }
        startServiceCompat(ctx, intent)
      }
    }

    AsyncFunction("update") { args: UpdateArgs ->
      appContext.reactContext?.let { ctx ->
        val intent = Intent(ctx, ReadingActivityService::class.java).apply {
          action = ReadingActivityService.ACTION_UPDATE
          putExtra(ReadingActivityService.EXTRA_STARTED_AT, args.startedAtMs.toLong())
          putExtra(ReadingActivityService.EXTRA_IS_PAUSED, args.isPaused)
          args.pausedAtMs?.let {
            putExtra(ReadingActivityService.EXTRA_PAUSED_AT, it.toLong())
          }
        }
        startServiceCompat(ctx, intent)
      }
    }

    AsyncFunction("end") {
      appContext.reactContext?.let { ctx ->
        val intent = Intent(ctx, ReadingActivityService::class.java).apply {
          action = ReadingActivityService.ACTION_END
        }
        startServiceCompat(ctx, intent)
      }
    }
  }

  // Wrapper compat : sur Android 8+ on doit utiliser startForegroundService
  // (sinon ANR). En dessous, startService classique. ContextCompat fait le tri.
  private fun startServiceCompat(ctx: android.content.Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ContextCompat.startForegroundService(ctx, intent)
    } else {
      ctx.startService(intent)
    }
  }

  companion object {
    @Volatile
    private var instance: LiveActivityModule? = null

    // Appelé par ReadingActivityActionReceiver. Si le module n'est pas alive
    // (process JS killed), l'event est perdu — c'est OK, le foreground service
    // garde le process en vie la plupart du temps.
    fun dispatchEvent(name: String) {
      val module = instance ?: return
      try {
        module.sendEvent(name, emptyMap<String, Any?>())
      } catch (_: Throwable) {
        // sendEvent peut throw si l'event n'est pas déclaré ou si le runtime
        // est down — on ignore.
      }
    }
  }
}

// Les Number JS arrivent en Double — on cast en Long côté logique. Aligne le
// pattern de l'iOS (qui fait `args["startedAtMs"] as? NSNumber).doubleValue`).
class StartArgs(
  @Field val bookTitle: String = "",
  @Field val bookAuthor: String = "",
  @Field val bookIsbn: String = "",
  @Field val bookCoverUrl: String? = null,
  @Field val startedAtMs: Double = 0.0,
) : Record

class UpdateArgs(
  @Field val startedAtMs: Double = 0.0,
  @Field val isPaused: Boolean = false,
  @Field val pausedAtMs: Double? = null,
) : Record
