package io.github.baconshow.cody

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a reboot, the watch comes back if it was on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = Prefs(context)
        if (prefs.watch && prefs.address != null) WatchService.start(context)
    }
}
