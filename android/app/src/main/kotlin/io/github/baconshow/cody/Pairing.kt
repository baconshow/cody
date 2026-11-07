package io.github.baconshow.cody

import java.net.URI
import java.net.URISyntaxException

/** The computer's address, as typed or scanned, made into the one form the app keeps: `https://host[:port]/`. */
object Pairing {
    /** Where a developer's Cody runs without Tailscale: the emulator's view of this computer, or the phone's own */
    private val PLAIN_HOSTS = setOf("localhost", "127.0.0.1", "10.0.2.2")

    /** `https://my-pc.tailnet.ts.net/`, or null when the text is not an address Cody can be at. */
    fun normalize(text: String?): String? {
        var raw = text?.trim()?.trimEnd('/') ?: return null
        if (raw.isEmpty()) return null
        if (!raw.contains("://")) raw = "https://$raw"
        val uri = try { URI(raw) } catch (_: URISyntaxException) { return null }
        val host = uri.host?.lowercase() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val plain = host in PLAIN_HOSTS
        if (scheme != "https" && !(scheme == "http" && plain)) return null
        if (!uri.path.isNullOrEmpty() || uri.userInfo != null || uri.query != null || uri.fragment != null) return null
        val port = if (uri.port == -1) "" else ":${uri.port}"
        return "$scheme://$host$port/"
    }

    /** The address inside a `cody://pair?url=...` link (the QR code on the computer), or null. */
    fun fromLink(link: String?): String? {
        val uri = try { URI(link ?: return null) } catch (_: URISyntaxException) { return null }
        if (uri.scheme != "cody" || uri.host != "pair") return null
        val query = uri.rawQuery ?: return null
        val url = query.split('&').map { it.split('=', limit = 2) }
            .firstOrNull { it.size == 2 && it[0] == "url" }?.get(1) ?: return null
        return normalize(java.net.URLDecoder.decode(url, "UTF-8"))
    }
}
