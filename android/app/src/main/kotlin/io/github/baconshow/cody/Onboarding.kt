package io.github.baconshow.cody

/** The six screens of the first run, in order: PairActivity shows one at a time. */
enum class Step { WELCOME, PREREQS, PAIR, NOTIFY, WIDGET, DONE }

/** What the phone found out about one prerequisite. Nothing here blocks the flow: the real check is pairing. */
enum class Check { UNKNOWN, OK, MISSING }

/** The two prerequisites: Cody running on the computer (known only once an address is), Tailscale on this phone. */
data class Prereqs(val cody: Check = Check.UNKNOWN, val tailscale: Check = Check.UNKNOWN) {
    val allGood: Boolean get() = cody == Check.OK && tailscale == Check.OK
}

/** The order of the first run and where it opens; pure, so it can be tested without a phone. */
object Onboarding {
    /** The progress bar: one segment per step after the welcome */
    const val SEGMENTS = 5

    /** A pair link (the QR code) or the Settings shortcut open at the address; a first run opens at the top. */
    fun first(linked: Boolean, settings: Boolean): Step = if (linked || settings) Step.PAIR else Step.WELCOME

    /** The step after [step], or null after the last. */
    fun next(step: Step): Step? = Step.entries.getOrNull(step.ordinal + 1)

    /** The step the back gesture returns to, or null to leave: the flow never goes below where it opened. */
    fun back(step: Step, entry: Step): Step? =
        if (step.ordinal <= entry.ordinal) null else Step.entries[step.ordinal - 1]

    /** How many segments are lit on [step]: none on the welcome (the bar is hidden), all five when done. */
    fun lit(step: Step): Int = step.ordinal
}
