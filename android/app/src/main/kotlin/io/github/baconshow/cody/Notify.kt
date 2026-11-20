package io.github.baconshow.cody

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** The two notification channels: the quiet one that keeps the watch alive, and the heads-up ones with sound. */
object Notify {
    const val WATCH_CHANNEL = "watch"
    const val ALERT_CHANNEL = "alerts"
    const val WATCH_ID = 1

    fun channels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(WATCH_CHANNEL, context.getString(R.string.channel_watch), NotificationManager.IMPORTANCE_MIN)
                .apply { description = context.getString(R.string.channel_watch_hint); setShowBadge(false) })
        manager.createNotificationChannel(
            NotificationChannel(ALERT_CHANNEL, context.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH)
                .apply { description = context.getString(R.string.channel_alerts_hint); enableVibration(true) })
    }

    /** The persistent notification a foreground service must show: one line, no sound, tap to open the mascot. */
    fun watching(context: Context, text: String): Notification =
        Notification.Builder(context, WATCH_CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(openMascot(context))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()

    fun alert(context: Context, event: Event) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val title = when (event.kind) {
            "done" -> context.getString(R.string.title_done)
            "needs_you" -> context.getString(R.string.title_needs_you)
            else -> event.app ?: context.getString(R.string.app_name)
        }
        val notification = Notification.Builder(context, ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(event.say)
            .setContentIntent(openMascot(context))
            .setAutoCancel(true)
            .setCategory(if (event.kind == "needs_you") Notification.CATEGORY_CALL else Notification.CATEGORY_STATUS)
            .build()
        manager.notify(ALERT_BASE + (event.seq % 1000).toInt(), notification)
    }

    private fun openMascot(context: Context): PendingIntent =
        PendingIntent.getActivity(context, 0, Intent(context, PairActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private const val ALERT_BASE = 1000
}
