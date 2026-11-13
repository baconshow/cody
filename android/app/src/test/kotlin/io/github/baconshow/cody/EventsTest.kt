package io.github.baconshow.cody

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EventsTest {
    private val reply = """{"cursor": 7, "events": [
        {"seq": 5, "kind": "done", "seconds": 95, "say": "Done! Claude finished."},
        {"seq": 6, "kind": "start", "seconds": null, "say": ""},
        {"seq": 7, "kind": "notice", "seconds": null, "say": "WhatsApp: Mom", "app": "WhatsApp"}]}"""

    @Test
    fun theFirstReadOnlyMarksWhereTheListIs() {
        val heard = Events.parse(reply, null)!!
        assertEquals(7L, heard.cursor)
        assertEquals(emptyList<Event>(), heard.events)
    }

    @Test
    fun onlyNewEventsOfKnownKindsAreTold() {
        val heard = Events.parse(reply, 4)!!
        assertEquals(listOf(5L, 7L), heard.events.map { it.seq })
        assertEquals(Event(5, "done", 95, "Done! Claude finished.", null), heard.events[0])
        assertEquals("WhatsApp", heard.events[1].app)
        assertEquals(emptyList<Event>(), Events.parse(reply, 7)!!.events)
    }

    @Test
    fun aComputerThatRestartedIsNotNews() {
        val heard = Events.parse(reply, 40)!!
        assertEquals(7L, heard.cursor)
        assertEquals("the cursor went back: nothing announced, the count restarts", emptyList<Event>(), heard.events)
    }

    @Test
    fun aReplyThatIsNotCodysIsNull() {
        assertNull(Events.parse("<html>", 0))
        assertNull(Events.parse("{}", 0))
        assertNull(Events.hello("{}"))
        assertEquals(Hello("abc", "pt-BR", "1.2.0"), Events.hello("""{"token": "abc", "language": "pt-BR", "version": "1.2.0"}"""))
    }
}
