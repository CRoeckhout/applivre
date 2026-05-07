package expo.modules.grimolia.liveactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// Équivalent Android du Live Activity iOS (modules/live-activity/ios). API JS
// strictement identique à la version iOS, donc le hook useReadingLiveActivity
// fonctionne sans changement.
//
// Implémentation : notification ongoing (pas de foreground service — la
// notification suffit pour rester visible dans le shade et sur le lock
// screen) avec un layout RemoteViews custom contenant icône, titre, timer
// et deux ImageButton Pause/Stop INLINE. Les boutons sont posés via
// setOnClickPendingIntent et ouvrent le deep link `grimolia://book/{isbn}?action=...`,
// ce qui réutilise le handler déjà en place dans app/book/[isbn].tsx —
// comme la version iOS du widget qui utilise des Link vers la même URL.
// On évite NotificationCompat.addAction parce qu'elles n'apparaissent qu'en
// mode expanded — on veut les boutons visibles en collapsed aussi.
//
// Le timer tick côté OS via Chronometer (zéro update JS pour les secondes).
// En mode pausé, on remplace par un TextView statique avec la valeur figée.

class LiveActivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveActivityModule")

    Function("isAvailable") {
      // Sur Android 13+ il faut POST_NOTIFICATIONS pour que la notif soit
      // visible. On retourne true ici quand même — l'app peut continuer,
      // la notif sera juste cachée si la perm n'est pas accordée. Le hook
      // JS ne bloque rien.
      true
    }

    Function("hasActive") {
      hasActive
    }

    AsyncFunction("start") { args: StartArgs ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      ensureChannel(ctx)
      val startedAtMs = args.startedAtMs.toLong()
      currentState = ActiveState(
        title = args.bookTitle,
        author = args.bookAuthor,
        isbn = args.bookIsbn,
        startedAtMs = startedAtMs,
      )
      postNotification(ctx, isPaused = false, pausedAtMs = null, startedAtMs = startedAtMs)
      hasActive = true
    }

    AsyncFunction("update") { args: UpdateArgs ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val state = currentState ?: return@AsyncFunction
      // Si l'app a été tuée et que le module a été recréé, on adopte la
      // notif existante via un new state — mais ici on n'a pas le book
      // metadata (title/author/isbn) accessibles. Solution : on demande au
      // JS de toujours appeler `start` avant `update` après un kill+relaunch.
      // Le hook JS le fait déjà via runningRef.current.
      val startedAtMs = args.startedAtMs.toLong()
      currentState = state.copy(startedAtMs = startedAtMs)
      postNotification(
        ctx,
        isPaused = args.isPaused,
        pausedAtMs = args.pausedAtMs?.toLong(),
        startedAtMs = startedAtMs,
      )
    }

    AsyncFunction("end") {
      appContext.reactContext?.let { ctx ->
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID)
      }
      currentState = null
      hasActive = false
    }
  }

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Lecture en cours",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Affiche la session de lecture en cours."
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun postNotification(
    ctx: Context,
    isPaused: Boolean,
    pausedAtMs: Long?,
    startedAtMs: Long,
  ) {
    val state = currentState ?: return
    val packageName = ctx.packageName

    val views = RemoteViews(packageName, R.layout.reading_activity_notification)
    views.setTextViewText(
      R.id.book_title,
      state.title.ifEmpty { "Lecture en cours" },
    )

    if (isPaused) {
      val anchor = pausedAtMs ?: System.currentTimeMillis()
      val elapsedMs = (anchor - startedAtMs).coerceAtLeast(0)
      views.setTextViewText(R.id.paused_timer, formatElapsed(elapsedMs))
      views.setViewVisibility(R.id.timer, View.GONE)
      views.setViewVisibility(R.id.paused_timer, View.VISIBLE)
    } else {
      // Convertit la wall-clock virtualStart en base elapsedRealtime pour
      // que Chronometer affiche elapsed = now - virtualStart côté OS.
      val elapsedNow = SystemClock.elapsedRealtime()
      val wallNow = System.currentTimeMillis()
      val base = elapsedNow - (wallNow - startedAtMs)
      views.setChronometer(R.id.timer, base, null, true)
      views.setViewVisibility(R.id.timer, View.VISIBLE)
      views.setViewVisibility(R.id.paused_timer, View.GONE)
    }

    // Boutons : click PendingIntent directement sur le bouton du layout (pas
    // via addAction, car les actions NotificationCompat ne s'affichent qu'en
    // mode expanded — on les veut visibles en collapsed aussi).
    val pauseAction = if (isPaused) "resume" else "pause"
    val pauseIcon =
      if (isPaused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause
    views.setImageViewResource(R.id.btn_pause, pauseIcon)
    views.setOnClickPendingIntent(
      R.id.btn_pause,
      deepLinkIntent(ctx, state.isbn, pauseAction),
    )
    views.setOnClickPendingIntent(
      R.id.btn_stop,
      deepLinkIntent(ctx, state.isbn, "stop"),
    )

    val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_book)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(views)
      .setCustomBigContentView(views)
      .setContentIntent(deepLinkIntent(ctx, state.isbn, action = null))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)

    NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build())
  }

  private fun deepLinkIntent(ctx: Context, isbn: String, action: String?): PendingIntent {
    val uri = if (action != null) {
      Uri.parse("grimolia://book/$isbn?action=$action")
    } else {
      Uri.parse("grimolia://book/$isbn")
    }
    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      `package` = ctx.packageName
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val requestCode = (action ?: "view").hashCode()
    return PendingIntent.getActivity(ctx, requestCode, intent, flags)
  }

  private fun formatElapsed(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
  }

  companion object {
    private const val CHANNEL_ID = "reading_activity"
    private const val NOTIFICATION_ID = 9000

    @Volatile
    private var hasActive: Boolean = false

    @Volatile
    private var currentState: ActiveState? = null
  }
}

private data class ActiveState(
  val title: String,
  val author: String,
  val isbn: String,
  val startedAtMs: Long,
)

// Les Number JS arrivent en Double — on cast en Long côté logique. Aligne
// le pattern de l'iOS (qui fait `args["startedAtMs"] as? NSNumber).doubleValue`).
class StartArgs(
  @Field val bookTitle: String = "",
  @Field val bookAuthor: String = "",
  @Field val bookIsbn: String = "",
  @Field val startedAtMs: Double = 0.0,
) : Record

class UpdateArgs(
  @Field val startedAtMs: Double = 0.0,
  @Field val isPaused: Boolean = false,
  @Field val pausedAtMs: Double? = null,
) : Record
