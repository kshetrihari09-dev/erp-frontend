package com.byapar.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * MlKitOcrPlugin
 *
 * Capacitor bridge around Google ML Kit's on-device Text Recognition v2 —
 * the current standalone SDK (com.google.mlkit:text-recognition), NOT the
 * deprecated Firebase ML Vision APIs. This is the primary OCR engine on
 * Android; Tesseract.js remains the web-only fallback (see
 * src/plugins/MlKitOcr.ts and useLocalScanner.ts on the JS side).
 *
 * The recognizer is created lazily and reused for the lifetime of this
 * plugin instance — never recreated per frame — and explicitly released
 * via release() when OCR mode closes (see handleOnDestroy() too, as a
 * safety net if the JS side never calls release()).
 *
 * Everything runs on-device: a base64 image crop comes in, structured
 * text/geometry goes back out. No network calls, no API keys, nothing
 * ever leaves the phone.
 */
@CapacitorPlugin(name = "MlKitOcr")
class MlKitOcrPlugin : Plugin() {

    private var recognizer: TextRecognizer? = null

    private fun getRecognizer(): TextRecognizer {
        var r = recognizer
        if (r == null) {
            r = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer = r
        }
        return r
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        try {
            getRecognizer()
            call.resolve()
        } catch (e: Exception) {
            call.reject("ML_KIT_INIT_FAILED", e)
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun recognizeText(call: PluginCall) {
        val raw = call.getString("image")
        if (raw == null) {
            call.reject("MISSING_IMAGE")
            return
        }
        val bitmap: Bitmap?
        try {
            val cleaned = if (raw.contains(",")) raw.substringAfter(",") else raw
            val bytes = Base64.decode(cleaned, Base64.DEFAULT)
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (e: Exception) {
            call.reject("DECODE_FAILED", e)
            return
        }
        if (bitmap == null) {
            call.reject("DECODE_FAILED")
            return
        }

        try {
            val image = InputImage.fromBitmap(bitmap, 0)
            getRecognizer().process(image)
                .addOnSuccessListener { visionText ->
                    try {
                        call.resolve(toResult(visionText, bitmap.width, bitmap.height))
                    } catch (e: Exception) {
                        call.reject("RESULT_SERIALIZATION_FAILED", e)
                    } finally {
                        bitmap.recycle()
                    }
                }
                .addOnFailureListener { e ->
                    bitmap.recycle()
                    call.reject("RECOGNITION_FAILED", e)
                }
        } catch (e: Exception) {
            bitmap.recycle()
            call.reject("RECOGNIZE_ERROR", e)
        }
    }

    @PluginMethod
    fun release(call: PluginCall) {
        recognizer?.close()
        recognizer = null
        call.resolve()
    }

    override fun handleOnDestroy() {
        recognizer?.close()
        recognizer = null
        super.handleOnDestroy()
    }

    // ── Text (ML Kit's result type) -> structured JS result ─────────────────
    private fun toResult(visionText: Text, imgW: Int, imgH: Int): JSObject {
        val root = JSObject()
        root.put("text", visionText.text)
        root.put("imageWidth", imgW)
        root.put("imageHeight", imgH)

        val blocksArr = JSArray()
        val linesArr = JSArray()
        val elementsArr = JSArray()

        var confidenceWeightSum = 0.0
        var elementCount = 0

        for (block in visionText.textBlocks) {
            val blockObj = JSObject()
            blockObj.put("text", block.text)
            blockObj.put("boundingBox", rectToJs(block.boundingBox))

            val blockLines = JSArray()
            for (line in block.lines) {
                val lineObj = JSObject()
                lineObj.put("text", line.text)
                lineObj.put("boundingBox", rectToJs(line.boundingBox))

                var lineConfSum = 0.0
                var lineConfCount = 0
                val lineElements = JSArray()
                for (element in line.elements) {
                    val elObj = JSObject()
                    elObj.put("text", element.text)
                    elObj.put("boundingBox", rectToJs(element.boundingBox))
                    // ML Kit's Latin recognizer doesn't expose a reliable
                    // per-element confidence across devices/versions, so
                    // this falls back to a length/shape heuristic (a
                    // clean, longer alphanumeric token scores higher than
                    // a very short or symbol-heavy one) rather than
                    // hardcoding 1.0 or omitting the field.
                    val conf = estimateElementConfidence(element.text)
                    elObj.put("confidence", conf)
                    lineElements.put(elObj)
                    elementsArr.put(elObj)
                    lineConfSum += conf
                    lineConfCount++
                    confidenceWeightSum += conf
                    elementCount++
                }
                lineObj.put("elements", lineElements)
                lineObj.put("confidence", if (lineConfCount > 0) lineConfSum / lineConfCount else 0.5)
                blockLines.put(lineObj)
                linesArr.put(lineObj)
            }
            blockObj.put("lines", blockLines)
            blocksArr.put(blockObj)
        }

        root.put("blocks", blocksArr)
        root.put("lines", linesArr)
        root.put("elements", elementsArr)
        root.put("confidence", if (elementCount > 0) confidenceWeightSum / elementCount else 0.0)

        return root
    }

    private fun rectToJs(rect: Rect?): JSObject {
        val r = JSObject()
        if (rect == null) {
            r.put("left", 0); r.put("top", 0); r.put("width", 0); r.put("height", 0)
            return r
        }
        r.put("left", rect.left)
        r.put("top", rect.top)
        r.put("width", rect.width())
        r.put("height", rect.height())
        return r
    }

    private fun estimateElementConfidence(text: String): Double {
        if (text.isEmpty()) return 0.0
        val alnum = text.count { it.isLetterOrDigit() }
        val ratio = alnum.toDouble() / text.length.toDouble()
        val lengthFactor = text.length.coerceAtMost(6).toDouble() / 6.0
        return (0.5 + 0.5 * ratio) * (0.6 + 0.4 * lengthFactor)
    }
}
