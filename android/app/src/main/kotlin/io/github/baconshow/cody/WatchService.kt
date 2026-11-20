package io.github.baconshow.cody

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.io.IOException
import kotlin.concurrent.thread

/**
 * Waits on the computer while the app is closed (opt-in, the switch on the pairing screen). One thread: the token
 * from /app/hello, then /api/events held open by the computer up to WAIT_S seconds at a time, so the phone sleeps
 * between heads-ups instead of asking every few seconds. A refused token means the computer restarted: ask again.
 * Network trouble backs off (5 s, 30 s, 2 min) and keeps trying; the quiet notification says which.
 */
class WatchService : Service() {
    @Volatile private var running = false
    private var worker: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Notify.channels(this)
        val notification = Notify.watching(this, getString(R.string.watching))
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(Notify.WATCH_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(Notify.WATCH_ID, notification)
        }
        if (!running) {
            running = true
            worker = thread(name = "cody-watch") { loop() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        worker?.interrupt()
        super.onDestroy()
    }

    private fun loop() {
        val prefs = Prefs(this)
        var token: String? = null
        var after: Long? = null
        var failures = 0
        while (running) {
            val address = prefs.address
            if (address == null) { stopSelf(); return }
            val api = CodyApi(address)
            try {
                if (token == null) token = api.hello().token
                val heard = Events.parse(api.events(token, after ?: 0, WAIT_S), after)
                    ?: throw IOException("not Cody's reply")
                for (event in heard.events) {
                    Notify.alert(this, event)
                    MoodWidget.show(this, event.kind, event.say)
                }
                after = heard.cursor
                if (failures > 0) say(getString(R.string.watching))
                failures = 0
            } catch (_: Forbidden) {
                token = null
                pause(RETRY_S[0])
            } catch (_: InterruptedException) {
                return
            } catch (_: IOException) {
                say(getString(R.string.watch_offline))
                pause(RETRY_S[minOf(failures, RETRY_S.size - 1)])
                failures++
            }
        }
    }

    private fun say(text: String) {
        getSystemService(android.app.NotificationManager::class.java).notify(Notify.WATCH_ID, Notify.watching(this, text))
    }

    private fun pause(seconds: Int) {
        try { Thread.sleep(seconds * 1000L) } catch (_: InterruptedException) { running = false }
    }

    companion object {
        const val WAIT_S = 25
        val RETRY_S = intArrayOf(5, 30, 120)

        fun start(context: Context) {
            context.startForegroundService(Intent(context, WatchService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WatchService::class.java))
        }
    }
}
