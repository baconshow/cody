package io.github.baconshow.cody

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import android.widget.ViewFlipper
import java.io.IOException
import kotlin.concurrent.thread

/**
 * The front door, and the first run: welcome, the two prerequisites, pairing with the computer (the QR code's
 * cody://pair link, or the address typed), the heads-up switch, the widget, done. Paired already: straight to the
 * mascot, unless opened from the Settings shortcut (the flow from the address on) or a pair link. The steps are
 * plain views in a ViewFlipper; [Onboarding] decides their order, [Pairing] cleans the address, and the computer's
 * /app/hello is the one real check.
 */
class PairActivity : Activity() {
    /** The pairing step's own screens: choose how, type, wait, and the two outcomes */
    private enum class PairView { CHOOSE, TYPE, CHECKING, NOT_FOUND, CONNECTED }

    private lateinit var prefs: Prefs
    private lateinit var steps: ViewFlipper
    private lateinit var progress: ViewGroup
    private lateinit var address: EditText
    private lateinit var watch: Switch
    private val main = Handler(Looper.getMainLooper())
    private var step = Step.WELCOME
    private var entry = Step.WELCOME
    private var prereqs = Prereqs()
    private var pairView = PairView.CHOOSE

    /** The clean address being checked, or the one the computer answered at; null before Connect */
    private var candidate: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val linked = Pairing.fromLink(intent?.dataString)
        val settings = intent?.getBooleanExtra(EXTRA_SETTINGS, false) == true
        // A turn of the phone recreates the screen mid-flow: carry on where it was, never jump to the mascot
        if (savedInstanceState == null && linked == null && !settings && prefs.address != null) {
            openMascot()
            return
        }
        setContentView(R.layout.activity_pair)
        steps = findViewById(R.id.steps)
        progress = findViewById(R.id.progress)
        address = findViewById(R.id.address)
        watch = findViewById(R.id.watch)
        padForSystemBars(findViewById(R.id.root))
        wireWelcome()
        wirePrereqs()
        wirePair()
        wireNotify()
        wireWidget()
        findViewById<View>(R.id.openCody).setOnClickListener { if (prefs.address == null) show(Step.PAIR) else openMascot() }
        if (savedInstanceState != null) {
            restore(savedInstanceState)
            return
        }
        entry = Onboarding.first(linked != null, settings)
        show(entry)
        // A link, or the Settings shortcut with an address already kept: check it right away
        val known = linked ?: prefs.address?.takeIf { settings }
        if (known != null) connect(known)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt(KEY_STEP, step.ordinal)
        outState.putInt(KEY_ENTRY, entry.ordinal)
        outState.putInt(KEY_PAIR_VIEW, pairView.ordinal)
        outState.putString(KEY_CANDIDATE, candidate)
        outState.putInt(KEY_CODY, prereqs.cody.ordinal)
    }

    /** The fields are plain enums and one string; the views (the typed address, the switch) restore themselves */
    private fun restore(state: Bundle) {
        entry = Step.entries[state.getInt(KEY_ENTRY)]
        candidate = state.getString(KEY_CANDIDATE)
        prereqs = Prereqs(cody = Check.entries[state.getInt(KEY_CODY)])
        pairView = PairView.entries[state.getInt(KEY_PAIR_VIEW)]
        show(Step.entries[state.getInt(KEY_STEP)])
        // A check that was running died with the old screen: ask again
        if (pairView == PairView.CHECKING) candidate?.let { connect(it) }
    }

    /** launchMode singleTask: the QR code's link lands here while the flow is open (back from the camera app) */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val linked = Pairing.fromLink(intent.dataString) ?: return
        show(Step.PAIR)
        connect(linked)
    }

    private fun show(next: Step) {
        step = next
        steps.displayedChild = next.ordinal
        progress.visibility = if (next == Step.WELCOME) View.GONE else View.VISIBLE
        val lit = Onboarding.lit(next)
        for (i in 0 until progress.childCount) progress.getChildAt(i).isActivated = i < lit
        when (next) {
            Step.PREREQS -> checkPrereqs()
            Step.PAIR -> showPair(pairView)
            Step.NOTIFY -> watch.isChecked = prefs.watch
            else -> {}
        }
    }

    private fun advance() {
        Onboarding.next(step)?.let { show(it) }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (step == Step.PAIR && pairView != PairView.CHOOSE) {
            showPair(if (pairView == PairView.TYPE) PairView.CHOOSE else PairView.TYPE)
            return
        }
        val previous = Onboarding.back(step, entry)
        @Suppress("DEPRECATION")
        if (previous == null) super.onBackPressed() else show(previous)
    }

    // 01 Welcome

    private fun wireWelcome() {
        findViewById<View>(R.id.start).setOnClickListener { advance() }
    }

    // 02 Two things first

    private fun wirePrereqs() {
        findViewById<TextView>(R.id.copy).setOnClickListener { view ->
            getSystemService(ClipboardManager::class.java)
                .setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), getString(R.string.run_command)))
            (view as TextView).setText(R.string.copied)
            main.postDelayed({ view.setText(R.string.copy) }, COPIED_MS)
        }
        findViewById<View>(R.id.github).setOnClickListener { view(getString(R.string.github_url)) }
        findViewById<View>(R.id.tailscaleAction).setOnClickListener { Tailscale.open(this) }
        findViewById<View>(R.id.prereqsNext).setOnClickListener { advance() }
    }

    /** Tailscale: whether its app is here. Cody: only with an address already known (the Settings shortcut). */
    private fun checkPrereqs() {
        prereqs = prereqs.copy(tailscale = if (Tailscale.installed(packageManager)) Check.OK else Check.MISSING)
        renderPrereqs()
        val known = prefs.address ?: return
        thread(name = "cody-prereq") {
            val running = reachable(known)
            main.post {
                if (isDestroyed) return@post
                prereqs = prereqs.copy(cody = if (running) Check.OK else Check.MISSING)
                renderPrereqs()
            }
        }
    }

    private fun renderPrereqs() {
        val cody = prereqs.cody
        findViewById<View>(R.id.cardCody).setBackgroundResource(if (cody == Check.OK) R.drawable.bg_card_ok else R.drawable.bg_card)
        findViewById<ImageView>(R.id.markCody).setImageResource(if (cody == Check.OK) R.drawable.mark_ok else R.drawable.mark_pending)
        chip(findViewById(R.id.chipCody), cody, when (cody) {
            Check.OK -> R.string.check_running
            Check.MISSING -> R.string.check_not_found
            Check.UNKNOWN -> R.string.check_pending
        })
        val tailscale = prereqs.tailscale == Check.OK
        findViewById<View>(R.id.cardTailscale).setBackgroundResource(if (tailscale) R.drawable.bg_card_ok else R.drawable.bg_card)
        findViewById<ImageView>(R.id.markTailscale).setImageResource(if (tailscale) R.drawable.mark_ok else R.drawable.mark_pending)
        // Not installed is not an error, just not yet: the grey chip and the Install button
        chip(findViewById(R.id.chipTailscale), if (tailscale) Check.OK else Check.UNKNOWN,
            if (tailscale) R.string.check_installed else R.string.check_not_found)
        findViewById<Button>(R.id.tailscaleAction).setText(if (tailscale) R.string.open_app else R.string.install)
        findViewById<TextView>(R.id.prereqsNote).setText(if (prereqs.allGood) R.string.prereqs_all_good else R.string.prereqs_note)
    }

    /** The status chip: green, grey or red, with its dot */
    private fun chip(view: TextView, look: Check, text: Int) {
        val (background, color, dot) = when (look) {
            Check.OK -> Triple(R.drawable.bg_chip_ok, R.color.ok_text, R.drawable.dot_ok)
            Check.MISSING -> Triple(R.drawable.bg_chip_error, R.color.error_text, R.drawable.dot_error)
            Check.UNKNOWN -> Triple(R.drawable.bg_chip, R.color.dim, R.drawable.dot_dim)
        }
        view.setText(text)
        view.setBackgroundResource(background)
        view.setTextColor(getColor(color))
        view.setCompoundDrawablesRelativeWithIntrinsicBounds(dot, 0, 0, 0)
    }

    // 03 Connect to your computer

    private fun wirePair() {
        findViewById<View>(R.id.openCamera).setOnClickListener { openCamera() }
        findViewById<View>(R.id.typeInstead).setOnClickListener { showPair(PairView.TYPE) }
        findViewById<View>(R.id.scanInstead).setOnClickListener { showPair(PairView.CHOOSE) }
        findViewById<View>(R.id.connect).setOnClickListener { connectTyped() }
        findViewById<View>(R.id.changeAddress).setOnClickListener { showPair(PairView.TYPE) }
        findViewById<View>(R.id.openTailscale).setOnClickListener { Tailscale.open(this) }
        findViewById<View>(R.id.resultPrimary).setOnClickListener {
            val clean = candidate ?: return@setOnClickListener
            if (pairView == PairView.CONNECTED) {
                prefs.address = clean
                advance()
            } else {
                connect(clean)
            }
        }
        address.setOnEditorActionListener { _, action, _ ->
            if (action != EditorInfo.IME_ACTION_GO) return@setOnEditorActionListener false
            connectTyped()
            true
        }
        address.setOnFocusChangeListener { _, _ -> paintLabel() }
        address.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = typed()
        })
    }

    /** The phone's own camera reads the QR code and offers the cody://pair link, which comes back to onNewIntent */
    private fun openCamera() {
        try {
            startActivity(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.camera_missing, Toast.LENGTH_LONG).show()
            showPair(PairView.TYPE)
        }
    }

    private fun showPair(view: PairView) {
        pairView = view
        findViewById<View>(R.id.pairChoose).visibility = if (view == PairView.CHOOSE) View.VISIBLE else View.GONE
        findViewById<View>(R.id.pairType).visibility =
            if (view == PairView.TYPE || view == PairView.CHECKING) View.VISIBLE else View.GONE
        findViewById<View>(R.id.pairResult).visibility =
            if (view == PairView.NOT_FOUND || view == PairView.CONNECTED) View.VISIBLE else View.GONE
        when (view) {
            PairView.CHOOSE -> keyboard(false)
            PairView.TYPE -> {
                // Back from "looking" or from a result: the helper line says what it said before the check
                help(if (address.isActivated) R.string.address_invalid else R.string.address_help,
                    if (address.isActivated) R.color.error_text else R.color.dim)
                typed()
                address.requestFocus()
                keyboard(true)
            }
            PairView.CHECKING -> {
                findViewById<View>(R.id.connect).isEnabled = false
                help(R.string.pair_checking, R.color.dim)
                keyboard(false)
            }
            PairView.NOT_FOUND, PairView.CONNECTED -> {
                keyboard(false)
                renderResult(view == PairView.CONNECTED)
            }
        }
    }

    /** Every edit clears the red; Connect is there as soon as something is typed */
    private fun typed() {
        if (address.isActivated) {
            address.isActivated = false
            help(R.string.address_help, R.color.dim)
        }
        findViewById<View>(R.id.connect).isEnabled = address.text.isNotBlank() && pairView != PairView.CHECKING
        paintLabel()
    }

    private fun paintLabel() {
        val color = when {
            address.isActivated -> R.color.error
            address.hasFocus() -> R.color.cody
            else -> R.color.dim
        }
        findViewById<TextView>(R.id.addressLabel).setTextColor(getColor(color))
    }

    private fun help(text: Int, color: Int) {
        val line = findViewById<TextView>(R.id.addressHelp)
        line.setText(text)
        line.setTextColor(getColor(color))
    }

    private fun connectTyped() {
        val clean = Pairing.normalize(address.text.toString())
        if (clean == null) {
            address.isActivated = true
            help(R.string.address_invalid, R.color.error_text)
            findViewById<View>(R.id.connect).isEnabled = false
            paintLabel()
            return
        }
        connect(clean)
    }

    /** Asks the computer for /app/hello: the real check. Only the newest attempt gets to show its outcome. */
    private fun connect(clean: String) {
        candidate = clean
        if (address.text.toString() != clean) {
            address.setText(clean)
            address.setSelection(clean.length)
        }
        showPair(PairView.CHECKING)
        thread(name = "cody-pair") {
            val found = reachable(clean)
            main.post {
                if (isDestroyed || candidate != clean || pairView != PairView.CHECKING) return@post
                showPair(if (found) PairView.CONNECTED else PairView.NOT_FOUND)
            }
        }
    }

    private fun reachable(clean: String): Boolean =
        try {
            CodyApi(clean).hello()
            true
        } catch (_: IOException) {
            false
        }

    private fun renderResult(found: Boolean) {
        findViewById<CodyHead>(R.id.resultHead).eyes = if (found) CodyHead.Eyes.HAPPY else CodyHead.Eyes.ASLEEP
        findViewById<View>(R.id.resultGlow).visibility = if (found) View.VISIBLE else View.INVISIBLE
        findViewById<View>(R.id.resultChip).visibility = if (found) View.VISIBLE else View.GONE
        findViewById<TextView>(R.id.resultTitle).setText(if (found) R.string.connected_title else R.string.not_found_title)
        findViewById<View>(R.id.resultBody).visibility = if (found) View.GONE else View.VISIBLE
        val shown = findViewById<TextView>(R.id.resultAddress)
        shown.text = candidate?.let { Pairing.display(it) } ?: ""
        shown.background = if (found) null else getDrawable(R.drawable.bg_address_chip)
        shown.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (found) 14f else 13f)
        (shown.layoutParams as ViewGroup.MarginLayoutParams).topMargin = dp(if (found) 12 else 24)
        findViewById<Button>(R.id.resultPrimary).setText(if (found) R.string.action_continue else R.string.try_again)
        findViewById<View>(R.id.openTailscale).visibility = if (found) View.GONE else View.VISIBLE
        findViewById<View>(R.id.changeAddress).visibility = if (found) View.GONE else View.VISIBLE
    }

    // 04 A heads-up, even with the app closed

    private fun wireNotify() {
        // The system asks the moment the switch goes on (Android 13+); refused, it goes back off in the result
        watch.setOnCheckedChangeListener { _, on ->
            if (on && needsNotificationPermission()) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), ASK_NOTIFICATIONS)
            }
        }
        findViewById<View>(R.id.notifyNext).setOnClickListener {
            setWatch(watch.isChecked)
            advance()
        }
        findViewById<View>(R.id.notifySkip).setOnClickListener {
            watch.isChecked = false
            setWatch(false)
            advance()
        }
    }

    private fun setWatch(on: Boolean) {
        prefs.watch = on
        if (on) WatchService.start(this) else WatchService.stop(this)
    }

    private fun needsNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != ASK_NOTIFICATIONS) return
        // No notifications allowed: nothing could be shown, so the switch goes back off instead of pretending
        if (grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) watch.isChecked = false
    }

    // 05 Cody on your home screen

    private fun wireWidget() {
        findViewById<View>(R.id.widgetAdd).setOnClickListener {
            requestWidget()
            advance()
        }
        findViewById<View>(R.id.widgetSkip).setOnClickListener { advance() }
    }

    /** The launcher's own "add widget" sheet; launchers without it get the long-press hint instead */
    private fun requestWidget() {
        val manager = AppWidgetManager.getInstance(this)
        val asked = manager.isRequestPinAppWidgetSupported &&
            manager.requestPinAppWidget(ComponentName(this, MoodWidget::class.java), null, null)
        if (!asked) Toast.makeText(this, R.string.widget_manual, Toast.LENGTH_LONG).show()
    }

    // Shared

    private fun openMascot() {
        startActivity(Intent(this, MascotActivity::class.java))
        finish()
    }

    private fun view(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, url, Toast.LENGTH_LONG).show()
        }
    }

    private fun keyboard(show: Boolean) {
        val input = getSystemService(InputMethodManager::class.java)
        if (show) input.showSoftInput(address, 0) else input.hideSoftInputFromWindow(address.windowToken, 0)
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    /**
     * Android 15 draws the app under the status and navigation bars (and the keyboard): the root pads itself by
     * what the system covers, the camera cutout included (a phone lying down has it on one side). Older versions
     * hand it zero and keep their own frame.
     */
    private fun padForSystemBars(root: View) {
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
    }

    companion object {
        const val EXTRA_SETTINGS = "settings"
        private const val ASK_NOTIFICATIONS = 1
        private const val COPIED_MS = 1500L
        private const val KEY_STEP = "step"
        private const val KEY_ENTRY = "entry"
        private const val KEY_PAIR_VIEW = "pairView"
        private const val KEY_CANDIDATE = "candidate"
        private const val KEY_CODY = "cody"
    }
}
