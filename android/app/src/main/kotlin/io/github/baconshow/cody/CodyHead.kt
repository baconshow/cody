package io.github.baconshow.cody

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.provider.Settings
import android.util.AttributeSet
import android.view.View

/**
 * Cody's head, drawn by the app for the first run: the orange block, the sprout, and eyes that are open (and
 * blink, if asked), happy, or asleep. The same head as the design's "Cody Head" piece, in its 480 x 360 box,
 * scaled to the view. The blink is the only motion on these screens, and it stays still when the phone's
 * animations are off.
 */
class CodyHead @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    enum class Eyes { OPEN, HAPPY, ASLEEP }

    var eyes: Eyes = Eyes.OPEN
        set(value) { field = value; invalidate() }

    /** Only open eyes blink; asleep eyes have no blush either (the design's "not found" state) */
    var blink: Boolean = false
        set(value) { field = value; removeCallbacks(close); if (value) schedule() }

    private var lidClosed = false
    private var doubled = false
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val box = RectF()

    private val open = Runnable {
        lidClosed = false
        invalidate()
        if (!doubled && Math.random() < DOUBLE_CHANCE) {
            doubled = true
            postDelayed(close, 160)
        } else {
            doubled = false
            schedule()
        }
    }

    private val close: Runnable = Runnable {
        lidClosed = true
        invalidate()
        postDelayed(open, BLINK_MS)
    }

    init {
        context.theme.obtainStyledAttributes(attrs, R.styleable.CodyHead, 0, 0).apply {
            try {
                eyes = Eyes.entries[getInt(R.styleable.CodyHead_eyes, 0)]
                blink = getBoolean(R.styleable.CodyHead_blink, false)
            } finally {
                recycle()
            }
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = MeasureSpec.getSize(heightMeasureSpec)
        if (MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.EXACTLY) {
            setMeasuredDimension(width, height)
        } else {
            setMeasuredDimension(width, width * BOX_H / BOX_W)
        }
    }

    override fun onDraw(canvas: Canvas) {
        val scale = minOf(width / BOX_W.toFloat(), height / BOX_H.toFloat())
        canvas.save()
        canvas.translate((width - BOX_W * scale) / 2, (height - BOX_H * scale) / 2)
        canvas.scale(scale, scale)
        drawHead(canvas)
        if (eyes != Eyes.ASLEEP) drawBlush(canvas)
        when (eyes) {
            Eyes.OPEN -> { drawOpenEye(canvas, 98f); drawOpenEye(canvas, 338f) }
            Eyes.HAPPY -> { drawBars(canvas, 120f, 170f, 46f, 14f, -42f, 42f) ; drawBars(canvas, 360f, 170f, 46f, 14f, -42f, 42f) }
            Eyes.ASLEEP -> { drawBars(canvas, 120f, 184f, 46f, 12f, 26f, -26f); drawBars(canvas, 360f, 184f, 46f, 12f, 26f, -26f) }
        }
        drawSprout(canvas)
        canvas.restore()
    }

    /** The block: a 166-degree gradient of oranges, a warm light at the top left, a shade at the bottom right */
    private fun drawHead(canvas: Canvas) {
        box.set(0f, 80f, 480f, 360f)
        fill.shader = LinearGradient(193f, 32f, 287f, 408f,
            intArrayOf(0xffffa257.toInt(), 0xfffb7f28.toInt(), 0xfff26a10.toInt(), 0xffd8550a.toInt()),
            floatArrayOf(0f, .36f, .62f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(box, 66f, 66f, fill)
        fill.shader = ellipse(125f, 108f, 288f, 133f,
            intArrayOf(0x9effe4c4.toInt(), 0x38ffc48c, 0x00ffaa64), floatArrayOf(0f, .3f, .58f))
        canvas.drawRoundRect(box, 66f, 66f, fill)
        fill.shader = ellipse(365f, 371f, 228f, 105f, intArrayOf(0x80802800.toInt(), 0x00802800), floatArrayOf(0f, .66f))
        canvas.drawRoundRect(box, 66f, 66f, fill)
        fill.shader = ellipse(196f, 132f, 150f, 46f, intArrayOf(0x38ffffff, 0x00ffffff), floatArrayOf(0f, .68f))
        canvas.drawOval(46f, 86f, 346f, 178f, fill)
        fill.shader = null
    }

    private fun drawBlush(canvas: Canvas) {
        for (left in floatArrayOf(44f, 372f)) {
            fill.shader = ellipse(left + 32f, 269f, 32f, 13f,
                intArrayOf(0xf2ff8f86.toInt(), 0x8cff8f86.toInt(), 0x00ff8f86), floatArrayOf(0f, .45f, .74f))
            canvas.drawOval(left, 256f, left + 64f, 282f, fill)
        }
        fill.shader = null
    }

    /** A dark pill with a small highlight; the lid closes from the top when blinking */
    private fun drawOpenEye(canvas: Canvas, left: Float) {
        canvas.save()
        if (lidClosed) canvas.scale(1f, LID_CLOSED, left, 118f)
        fill.shader = LinearGradient(0f, 118f, 0f, 222f,
            intArrayOf(0xff34343a.toInt(), 0xff121214.toInt(), 0xff0b0b0d.toInt()), floatArrayOf(0f, .3f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(left, 118f, left + 44f, 222f, 22f, 22f, fill)
        fill.shader = null
        fill.color = 0xebffffff.toInt()
        canvas.drawRoundRect(left + 8f, 128f, left + 18f, 138f, 3f, 3f, fill)
        canvas.restore()
    }

    /** Two short bars meeting at an angle: a happy eye (^) or a sleeping one (v), centred on (x, y) */
    private fun drawBars(canvas: Canvas, x: Float, y: Float, length: Float, thick: Float, leftTilt: Float, rightTilt: Float) {
        fill.color = 0xff0b0b0d.toInt()
        val half = length / 2
        for ((center, tilt) in listOf(x - 13f to leftTilt, x + 13f to rightTilt)) {
            canvas.save()
            canvas.rotate(tilt, center, y)
            canvas.drawRoundRect(center - half, y - thick / 2, center + half, y + thick / 2, thick / 2, thick / 2, fill)
            canvas.restore()
        }
    }

    /** The stem and the two leaves on top, with their shadow on the block */
    private fun drawSprout(canvas: Canvas) {
        fill.shader = ellipse(240f, 83f, 26f, 7f, intArrayOf(0x80601c00.toInt(), 0x00601c00), floatArrayOf(0f, 1f))
        canvas.drawOval(214f, 76f, 266f, 90f, fill)
        fill.shader = LinearGradient(231f, 0f, 249f, 0f,
            intArrayOf(0xff3c7522.toInt(), 0xff62a238.toInt(), 0xff4a8629.toInt()), floatArrayOf(0f, .4f, 1f), Shader.TileMode.CLAMP)
        canvas.drawRoundRect(231f, 16f, 249f, 88f, 9f, 9f, fill)
        for ((left, tilt) in listOf(176f to -34f, 238f to 34f)) {
            canvas.save()
            canvas.rotate(tilt, left + 33f, 23f)
            fill.shader = LinearGradient(left, 8f, left + 66f, 38f,
                intArrayOf(0xff7fd95c.toInt(), 0xff47b33a.toInt(), 0xff348c2b.toInt()), floatArrayOf(0f, .52f, 1f), Shader.TileMode.CLAMP)
            canvas.drawOval(left, 8f, left + 66f, 38f, fill)
            canvas.restore()
        }
        fill.shader = null
    }

    /** A radial gradient stretched to an ellipse of radii (rx, ry) around (cx, cy) */
    private fun ellipse(cx: Float, cy: Float, rx: Float, ry: Float, colors: IntArray, stops: FloatArray): Shader =
        RadialGradient(cx, cy, rx, colors, stops, Shader.TileMode.CLAMP).apply {
            setLocalMatrix(Matrix().apply { setScale(1f, ry / rx, cx, cy) })
        }

    private fun schedule() {
        if (!blink || !isAttachedToWindow || !animationsOn()) return
        postDelayed(close, (BLINK_WAIT_MS + Math.random() * BLINK_SPREAD_MS).toLong())
    }

    private fun animationsOn(): Boolean =
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        schedule()
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(close)
        removeCallbacks(open)
        lidClosed = false
        super.onDetachedFromWindow()
    }

    companion object {
        const val BOX_W = 480
        const val BOX_H = 360
        private const val LID_CLOSED = 0.08f
        private const val BLINK_MS = 95L
        private const val BLINK_WAIT_MS = 2600.0
        private const val BLINK_SPREAD_MS = 3200.0
        private const val DOUBLE_CHANCE = 0.25
    }
}
