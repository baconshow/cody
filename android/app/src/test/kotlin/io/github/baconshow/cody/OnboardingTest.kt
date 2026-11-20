package io.github.baconshow.cody

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OnboardingTest {
    @Test
    fun aFirstRunOpensAtTheWelcomeAndALinkAtTheAddress() {
        assertEquals(Step.WELCOME, Onboarding.first(linked = false, settings = false))
        assertEquals("the QR code's link", Step.PAIR, Onboarding.first(linked = true, settings = false))
        assertEquals("the Settings shortcut", Step.PAIR, Onboarding.first(linked = false, settings = true))
    }

    @Test
    fun theStepsGoInOrderAndEnd() {
        val walk = generateSequence(Step.WELCOME) { Onboarding.next(it) }.toList()
        assertEquals(listOf(Step.WELCOME, Step.PREREQS, Step.PAIR, Step.NOTIFY, Step.WIDGET, Step.DONE), walk)
        assertNull(Onboarding.next(Step.DONE))
    }

    @Test
    fun backStopsWhereTheFlowOpened() {
        assertEquals(Step.PREREQS, Onboarding.back(Step.PAIR, entry = Step.WELCOME))
        assertEquals(Step.PAIR, Onboarding.back(Step.NOTIFY, entry = Step.PAIR))
        assertNull("opened from Settings: back leaves", Onboarding.back(Step.PAIR, entry = Step.PAIR))
        assertNull(Onboarding.back(Step.WELCOME, entry = Step.WELCOME))
    }

    @Test
    fun theProgressBarCountsTheStepsAfterTheWelcome() {
        assertEquals(0, Onboarding.lit(Step.WELCOME))
        assertEquals(1, Onboarding.lit(Step.PREREQS))
        assertEquals(Onboarding.SEGMENTS, Onboarding.lit(Step.DONE))
    }

    @Test
    fun allGoodNeedsBothPrerequisites() {
        assertFalse(Prereqs().allGood)
        assertFalse(Prereqs(cody = Check.OK).allGood)
        assertFalse(Prereqs(Check.OK, Check.MISSING).allGood)
        assertTrue(Prereqs(Check.OK, Check.OK).allGood)
    }
}
