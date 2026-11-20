package io.github.baconshow.cody

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/**
 * The Tailscale app on this phone: whether it is installed (the manifest's <queries> lets the app ask), and how
 * to open it or its store page. Whether it is connected is not something an app can know without a VPN
 * permission, so the real check stays with pairing.
 */
object Tailscale {
    const val PACKAGE = "com.tailscale.ipn"
    private const val STORE = "market://details?id=$PACKAGE"
    private const val STORE_WEB = "https://play.google.com/store/apps/details?id=$PACKAGE"

    fun installed(packageManager: PackageManager): Boolean =
        try {
            packageManager.getPackageInfo(PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

    /** Opens Tailscale, or its page on the store when it is not here. False when neither could be opened. */
    fun open(context: Context): Boolean {
        val launch = context.packageManager.getLaunchIntentForPackage(PACKAGE)
        if (launch != null) return start(context, launch)
        return start(context, Intent(Intent.ACTION_VIEW, Uri.parse(STORE))) ||
            start(context, Intent(Intent.ACTION_VIEW, Uri.parse(STORE_WEB)))
    }

    private fun start(context: Context, intent: Intent): Boolean =
        try {
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
}
