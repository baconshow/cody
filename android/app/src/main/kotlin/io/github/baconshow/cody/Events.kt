package io.github.baconshow.cody

import org.json.JSONException
import org.json.JSONObject

/** One heads-up from the computer (GET /api/events): what Cody says about it is made there, in your language. */
data class Event(val seq: Long, val kind: String, val seconds: Long?, val say: String, val app: String?)

/** The cursor of the list and the events worth telling, after one read of /api/events. */
data class Heard(val cursor: Long, val events: List<Event>)

object Events {
    /** What the phone announces: a long task done, Claude waiting for you, an important notification read aloud */
    val KINDS = setOf("done", "needs_you", "notice")

    /**
     * Reads the reply of GET /api/events?after=N. Only the events with seq > [after] and a known kind are kept;
     * with [after] null (the first read) none are, the read only marks where the list is, so the past is never
     * announced. When the computer restarted and counts from 0 again (cursor < after), nothing is announced either.
     */
    fun parse(body: String, after: Long?): Heard? {
        val json = try { JSONObject(body) } catch (_: JSONException) { return null }
        val cursor = json.optLong("cursor", -1)
        if (cursor < 0) return null
        if (after == null || cursor < after) return Heard(cursor, emptyList())
        val list = json.optJSONArray("events") ?: return Heard(cursor, emptyList())
        val events = ArrayList<Event>()
        for (i in 0 until list.length()) {
            val item = list.optJSONObject(i) ?: continue
            val seq = item.optLong("seq", -1)
            val kind = item.optString("kind")
            if (seq <= after || kind !in KINDS) continue
            val seconds = if (item.isNull("seconds")) null else item.optLong("seconds")
            val app = if (item.isNull("app")) null else item.optString("app")
            events.add(Event(seq, kind, seconds, item.optString("say"), app))
        }
        return Heard(cursor, events)
    }

    /** The token and the language from GET /app/hello, or null when the reply is not Cody's. */
    fun hello(body: String): Hello? {
        val json = try { JSONObject(body) } catch (_: JSONException) { return null }
        val token = json.optString("token")
        if (token.isEmpty()) return null
        return Hello(token, json.optString("language", "en"), json.optString("version", ""))
    }
}

data class Hello(val token: String, val language: String, val version: String)
