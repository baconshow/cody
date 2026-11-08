package io.github.baconshow.cody

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairingTest {
    @Test
    fun theAddressComesOutInOneForm() {
        assertEquals("https://my-pc.tailnet.ts.net/", Pairing.normalize("my-pc.tailnet.ts.net"))
        assertEquals("https://my-pc.tailnet.ts.net/", Pairing.normalize("  HTTPS://My-PC.tailnet.ts.net/  "))
        assertEquals("https://my-pc.tailnet.ts.net:8443/", Pairing.normalize("https://my-pc.tailnet.ts.net:8443"))
        assertEquals("the emulator's view of this computer", "http://10.0.2.2:7420/", Pairing.normalize("http://10.0.2.2:7420"))
    }

    @Test
    fun whatIsNotAnAddressIsRefused() {
        assertNull(Pairing.normalize(null))
        assertNull(Pairing.normalize(""))
        assertNull("plain http only to this computer", Pairing.normalize("http://my-pc.tailnet.ts.net/"))
        assertNull("nothing after the host", Pairing.normalize("https://my-pc.tailnet.ts.net/web/index.html"))
        assertNull(Pairing.normalize("https://me@my-pc.tailnet.ts.net/"))
        assertNull(Pairing.normalize("https://my-pc.tailnet.ts.net/?scene=party"))
        assertNull(Pairing.normalize("not an address at all"))
        assertNull(Pairing.normalize("ftp://my-pc.tailnet.ts.net/"))
    }

    @Test
    fun theAddressIsShownWithoutTheSchemeAndTheSlash() {
        assertEquals("my-pc.tailnet.ts.net", Pairing.display("https://my-pc.tailnet.ts.net/"))
        assertEquals("my-pc.tailnet.ts.net:8443", Pairing.display("https://my-pc.tailnet.ts.net:8443/"))
        assertEquals("10.0.2.2:7420", Pairing.display("http://10.0.2.2:7420/"))
    }

    @Test
    fun thePairLinkCarriesTheAddress() {
        assertEquals("https://my-pc.tailnet.ts.net/", Pairing.fromLink("cody://pair?url=https%3A%2F%2Fmy-pc.tailnet.ts.net%2F"))
        assertEquals("https://my-pc.tailnet.ts.net/", Pairing.fromLink("cody://pair?x=1&url=https://my-pc.tailnet.ts.net/"))
        assertNull(Pairing.fromLink("cody://pair"))
        assertNull(Pairing.fromLink("https://my-pc.tailnet.ts.net/"))
        assertNull(Pairing.fromLink("cody://pair?url=http://evil.example/"))
        assertNull(Pairing.fromLink(null))
    }
}
