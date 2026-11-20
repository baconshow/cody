package io.github.baconshow.cody

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import android.widget.RemoteViews

/**
 * A small Cody on the home screen: its face for the last heads-up (waiting for you, done, a notification, or just
 * there) and the words, with how long ago. Updated by WatchService as events come; a tap opens the mascot.
 */
class MoodWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val prefs = Prefs(context)
        for (id in ids) manager.updateAppWidget(id, views(context, prefs.lastKind, prefs.lastSay, prefs.lastAt))
    }

    companion object {
        /** Remembers the event and redraws every widget on the home screen. */
        fun show(context: Context, kind: String, say: String) {
            val prefs = Prefs(context)
            prefs.lastKind = kind
            prefs.lastSay = say
            prefs.lastAt = System.currentTimeMillis()
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MoodWidget::class.java))
            for (id in ids) manager.updateAppWidget(id, views(context, kind, say, prefs.lastAt))
        }

        fun face(kind: String): Int = when (kind) {
            "needs_you" -> R.drawable.face_pointing
            "done" -> R.drawable.face_happy
            "notice" -> R.drawable.face_talking
            else -> R.drawable.face_listening
        }

        private fun views(context: Context, kind: String, say: String, at: Long): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.mood_widget)
            views.setImageViewResource(R.id.face, face(kind))
            views.setTextViewText(R.id.say, say.ifEmpty { context.getString(R.string.widget_idle) })
            val ago = if (at > 0) DateUtils.getRelativeTimeSpanString(at, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS) else ""
            views.setTextViewText(R.id.ago, ago)
            val open = PendingIntent.getActivity(context, 0, Intent(context, PairActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            views.setOnClickPendingIntent(R.id.root, open)
            return views
        }
    }
}
