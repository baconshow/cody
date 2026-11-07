package io.github.baconshow.cody

import android.content.Context
import android.content.SharedPreferences

/** What the app remembers, on this phone only: the computer's address, whether to watch with the app closed, and
 *  the last thing the widget showed. No token is kept (it changes when the computer restarts). */
class Prefs(context: Context) {
    private val store: SharedPreferences = context.getSharedPreferences("cody", Context.MODE_PRIVATE)

    var address: String?
        get() = store.getString("address", null)
        set(value) = store.edit().putString("address", value).apply()

    var watch: Boolean
        get() = store.getBoolean("watch", false)
        set(value) = store.edit().putBoolean("watch", value).apply()

    var lastKind: String
        get() = store.getString("last_kind", "idle") ?: "idle"
        set(value) = store.edit().putString("last_kind", value).apply()

    var lastSay: String
        get() = store.getString("last_say", "") ?: ""
        set(value) = store.edit().putString("last_say", value).apply()

    var lastAt: Long
        get() = store.getLong("last_at", 0L)
        set(value) = store.edit().putLong("last_at", value).apply()
}
