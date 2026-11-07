package io.github.baconshow.cody

import android.net.Uri
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * The mascot: the page your computer serves, opened in Chrome as a Trusted Web Activity (full screen, landscape,
 * microphone and speech like any Chrome tab). The address comes from pairing, not from the manifest. When Chrome
 * cannot verify the site (/.well-known/assetlinks.json on the computer), it opens as a Custom Tab instead: the
 * same page with a thin bar on top.
 */
class MascotActivity : LauncherActivity() {
    override fun getLaunchingUrl(): Uri {
        val address = Prefs(this).address ?: return super.getLaunchingUrl()
        return Uri.parse(address)
    }
}
