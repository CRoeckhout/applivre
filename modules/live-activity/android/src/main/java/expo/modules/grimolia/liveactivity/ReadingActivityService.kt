package expo.modules.grimolia.liveactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URL

// Foreground service qui héberge la notification de session de lecture en
// cours. Comparé à une notification "normale" :
//   - Survit au kill de l'app (Android conserve la notification tant que le
//     service est foreground, via startForeground + foregroundServiceType).
//   - Le timer Chronometer continue à ticker côté OS sans le JS.
//   - Les boutons Pause/Resume restent réactifs même si le process JS dort
//     (broadcast direct au receiver, pas besoin que JS tourne).
//
// Foreground service type = `specialUse` (subtype "reading_session_progress").
// Pour distribution Play Store, il faudra une approval Console Google. En
// dev build c'est OK sans rien.
class ReadingActivityService : Service() {
  private val scope = CoroutineScope(Dispatchers.Main + Job())
  private var coverDownloadJob: Job? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> handleStart(intent)
      ACTION_UPDATE -> handleUpdate(intent)
      ACTION_END -> handleEnd()
    }
    return START_NOT_STICKY
  }

  private fun handleStart(intent: Intent) {
    ensureChannel(this)
    val state = ReadingState(
      title = intent.getStringExtra(EXTRA_TITLE).orEmpty(),
      author = intent.getStringExtra(EXTRA_AUTHOR).orEmpty(),
      isbn = intent.getStringExtra(EXTRA_ISBN).orEmpty(),
      coverUrl = intent.getStringExtra(EXTRA_COVER_URL),
      startedAtMs = intent.getLongExtra(EXTRA_STARTED_AT, System.currentTimeMillis()),
      isPaused = false,
      pausedAtMs = null,
    )
    currentState = state
    isActive = true

    startForegroundWithNotification(state)
    maybeDownloadCover(state)
  }

  private fun handleUpdate(intent: Intent) {
    val prev = currentState ?: return
    val state = prev.copy(
      startedAtMs = intent.getLongExtra(EXTRA_STARTED_AT, prev.startedAtMs),
      isPaused = intent.getBooleanExtra(EXTRA_IS_PAUSED, prev.isPaused),
      pausedAtMs = if (intent.hasExtra(EXTRA_PAUSED_AT)) {
        intent.getLongExtra(EXTRA_PAUSED_AT, 0L).takeIf { it > 0L }
      } else {
        prev.pausedAtMs
      },
    )
    currentState = state
    postNotification(state)
  }

  private fun handleEnd() {
    coverDownloadJob?.cancel()
    coverDownloadJob = null
    cachedCover = null
    cachedCoverUrl = null
    currentState = null
    isActive = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun startForegroundWithNotification(state: ReadingState) {
    val notification = buildNotification(state)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+ : startForeground exige un foregroundServiceType en
      // runtime qui matche le manifest.
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun postNotification(state: ReadingState) {
    NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, buildNotification(state))
  }

  private fun buildNotification(state: ReadingState): android.app.Notification {
    val views = RemoteViews(packageName, R.layout.reading_activity_notification)
    views.setTextViewText(
      R.id.book_title,
      state.title.ifEmpty { "Lecture en cours" },
    )

    if (state.isPaused) {
      val anchor = state.pausedAtMs ?: System.currentTimeMillis()
      val elapsedMs = (anchor - state.startedAtMs).coerceAtLeast(0)
      views.setTextViewText(R.id.paused_timer, formatElapsed(elapsedMs))
      views.setViewVisibility(R.id.timer, View.GONE)
      views.setViewVisibility(R.id.paused_timer, View.VISIBLE)
    } else {
      // Convertit la wall-clock virtualStart en base elapsedRealtime — le
      // Chronometer tickera correctement même si l'app est killed.
      val elapsedNow = SystemClock.elapsedRealtime()
      val wallNow = System.currentTimeMillis()
      val base = elapsedNow - (wallNow - state.startedAtMs)
      views.setChronometer(R.id.timer, base, null, true)
      views.setViewVisibility(R.id.timer, View.VISIBLE)
      views.setViewVisibility(R.id.paused_timer, View.GONE)
    }

    cachedCover?.let { views.setImageViewBitmap(R.id.book_icon, it) }

    // Pause/Resume → BROADCAST instantané (pas d'ouverture de l'app).
    val pauseAction = if (state.isPaused) ACTION_RESUME else ACTION_PAUSE
    val pauseIcon =
      if (state.isPaused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause
    views.setImageViewResource(R.id.btn_pause, pauseIcon)
    views.setOnClickPendingIntent(R.id.btn_pause, broadcastIntent(this, pauseAction))

    // Stop → DEEP LINK (ouvre l'app + finish modal pour saisir la page).
    views.setOnClickPendingIntent(
      R.id.btn_stop,
      deepLinkIntent(this, state.isbn, "stop"),
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_book)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(views)
      .setCustomBigContentView(views)
      .setContentIntent(deepLinkIntent(this, state.isbn, action = null))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .build()
  }

  private fun maybeDownloadCover(state: ReadingState) {
    val url = state.coverUrl ?: return
    if (url.isEmpty()) return
    if (cachedCoverUrl == url && cachedCover != null) {
      // Déjà en cache — mais on re-poste pour être sûr que la notif courante
      // l'affiche (cas d'un nouveau livre avec la même URL improbable).
      currentState?.let { postNotification(it) }
      return
    }

    coverDownloadJob?.cancel()
    coverDownloadJob = scope.launch {
      val bitmap = withContext(Dispatchers.IO) {
        try {
          val conn = URL(url).openConnection()
          conn.connectTimeout = 8000
          conn.readTimeout = 8000
          conn.getInputStream().use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
          null
        }
      }
      if (bitmap != null && currentState?.coverUrl == url) {
        cachedCover = bitmap
        cachedCoverUrl = url
        currentState?.let { postNotification(it) }
      }
    }
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
    val requestCode = ("deep_" + (action ?: "view")).hashCode()
    return PendingIntent.getActivity(ctx, requestCode, intent, flags)
  }

  private fun broadcastIntent(ctx: Context, action: String): PendingIntent {
    val intent = Intent(ctx, ReadingActivityActionReceiver::class.java).apply {
      this.action = action
      `package` = ctx.packageName
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(ctx, ("bcast_$action").hashCode(), intent, flags)
  }

  private fun formatElapsed(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
  }

  override fun onDestroy() {
    super.onDestroy()
    scope.cancel()
  }

  companion object {
    private const val CHANNEL_ID = "reading_activity"
    private const val NOTIFICATION_ID = 9000

    const val ACTION_START = "expo.modules.grimolia.liveactivity.START"
    const val ACTION_UPDATE = "expo.modules.grimolia.liveactivity.UPDATE"
    const val ACTION_END = "expo.modules.grimolia.liveactivity.END"

    // Actions broadcastées par les boutons de la notification — consommées
    // par ReadingActivityActionReceiver → forwardées à JS via le module.
    const val ACTION_PAUSE = "expo.modules.grimolia.liveactivity.PAUSE"
    const val ACTION_RESUME = "expo.modules.grimolia.liveactivity.RESUME"

    const val EXTRA_TITLE = "title"
    const val EXTRA_AUTHOR = "author"
    const val EXTRA_ISBN = "isbn"
    const val EXTRA_COVER_URL = "coverUrl"
    const val EXTRA_STARTED_AT = "startedAt"
    const val EXTRA_IS_PAUSED = "isPaused"
    const val EXTRA_PAUSED_AT = "pausedAt"

    @Volatile
    var isActive: Boolean = false
      private set

    @Volatile
    private var currentState: ReadingState? = null

    @Volatile
    private var cachedCover: Bitmap? = null

    @Volatile
    private var cachedCoverUrl: String? = null

    fun ensureChannel(ctx: Context) {
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
  }
}

internal data class ReadingState(
  val title: String,
  val author: String,
  val isbn: String,
  val coverUrl: String?,
  val startedAtMs: Long,
  val isPaused: Boolean,
  val pausedAtMs: Long?,
)
