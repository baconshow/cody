package io.github.baconshow.cody

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView

/**
 * The front door. Paired already: straight to the mascot (unless opened from the "Settings" shortcut or a pair
 * link). Not yet: the address of the computer (typed, or from the cody://pair link in the QR code Cody shows),
 * the switch for notifications with the app closed, and a word about the widget.
 */
class PairActivity : Activity() {
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val linked = Pairing.fromLink(intent?.dataString)
        val settings = intent?.getBooleanExtra(EXTRA_SETTINGS, false) == true
        if (linked == null && !settings && prefs.address != null) {
            openMascot()
            return
        }
        setContentView(R.layout.activity_pair)
        val address = findViewById<EditText>(R.id.address)
        val watch = findViewById<Switch>(R.id.watch)
        val status = findViewById<TextView>(R.id.status)
        address.setText(linked ?: prefs.address ?: "")
        watch.isChecked = prefs.watch
        findViewById<Button>(R.id.open).setOnClickListener {
            val clean = Pairing.normalize(address.text.toString())
            if (clean == null) {
                status.text = getString(R.string.bad_address)
                return@setOnClickListener
            }
            prefs.address = clean
            prefs.watch = watch.isChecked
            status.text = ""
            when {
                !watch.isChecked -> {
                    WatchService.stop(this)
                    openMascot()
                }
                // The mascot waits for the answer: finishing now would throw the answer away with the screen.
                needsNotificationPermission() ->
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), ASK_NOTIFICATIONS)
                else -> {
                    WatchService.start(this)
                    openMascot()
                }
            }
        }
        if (linked != null) status.text = getString(R.string.linked)
    }

    private fun needsNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != ASK_NOTIFICATIONS) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            WatchService.start(this)
        } else {
            // No notifications allowed: nothing to watch for. The switch goes back off instead of pretending.
            prefs.watch = false
        }
        openMascot()
    }

    private fun openMascot() {
        startActivity(Intent(this, MascotActivity::class.java))
        finish()
    }

    companion object {
        const val EXTRA_SETTINGS = "settings"
        private const val ASK_NOTIFICATIONS = 1
    }
}
