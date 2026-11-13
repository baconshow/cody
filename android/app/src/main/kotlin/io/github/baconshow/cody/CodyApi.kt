package io.github.baconshow.cody

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The computer refused the token: it restarted and made a new one. Ask /app/hello again. */
class Forbidden : IOException("forbidden")

/**
 * The two calls the app makes to the computer on its own (the page makes the rest): /app/hello for this run's
 * token, then /api/events with it. Plain HttpURLConnection; the address is https through Tailscale, or http to
 * a developer's own machine (see Pairing).
 */
class CodyApi(private val base: String) {
    fun hello(): Hello {
        val body = get("app/hello", null, CONNECT_MS)
        return Events.hello(body) ?: throw IOException("not Cody at $base")
    }

    /** GET /api/events?after=N&wait=S: the computer holds the request up to S seconds until something happens. */
    fun events(token: String, after: Long, waitSeconds: Int): String =
        get("api/events?after=$after&wait=$waitSeconds", token, CONNECT_MS + waitSeconds * 1000)

    private fun get(path: String, token: String?, readMs: Int): String {
        val connection = URL(base + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = CONNECT_MS
            connection.readTimeout = readMs
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Cody-Android")
            if (token != null) connection.setRequestProperty("X-Cody-Token", token)
            val status = connection.responseCode
            if (status == 403) throw Forbidden()
            if (status != 200) throw IOException("HTTP $status from $path")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val CONNECT_MS = 10_000
    }
}
