package com.party.android.data

import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import kotlin.coroutines.resume

/**
 * Thin Socket.IO wrapper. Does not set Origin (server allows missing Origin for native clients).
 */
class PartySocket {
    @Volatile
    private var socket: Socket? = null

    @Volatile
    var currentUrl: String? = null
        private set

    val connected: Boolean
        get() = socket?.connected() == true

    fun connect(baseUrl: String) {
        if (currentUrl == baseUrl && socket?.connected() == true) {
            return
        }
        disconnect()
        val options =
            IO.Options().apply {
                path = "/socket.io"
                transports = arrayOf("websocket", "polling")
                reconnection = true
                reconnectionDelay = 500
                reconnectionDelayMax = 3_000
                forceNew = true
                // Extra headers omitted on purpose — do not send Origin.
            }
        val next = IO.socket(URI.create(baseUrl), options)
        socket = next
        currentUrl = baseUrl
        next.connect()
    }

    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        currentUrl = null
    }

    fun on(event: String, listener: Emitter.Listener) {
        socket?.on(event, listener)
    }

    fun off(event: String, listener: Emitter.Listener) {
        socket?.off(event, listener)
    }

    fun off(event: String) {
        socket?.off(event)
    }

    fun emit(event: String, vararg args: Any) {
        socket?.emit(event, *args)
    }

    suspend fun emitAck(
        event: String,
        payload: JSONObject = JSONObject(),
        timeoutMs: Long = 10_000,
    ): JSONObject =
        suspendCancellableCoroutine { cont ->
            val s = socket
            if (s == null || !s.connected()) {
                cont.resume(JSONObject().put("ok", false).put("error", "Not connected"))
                return@suspendCancellableCoroutine
            }
            val timer = java.util.Timer("party-ack", true)
            val task =
                object : java.util.TimerTask() {
                    override fun run() {
                        if (cont.isActive) {
                            cont.resume(JSONObject().put("ok", false).put("error", "Request timed out"))
                        }
                    }
                }
            timer.schedule(task, timeoutMs)
            cont.invokeOnCancellation {
                task.cancel()
                timer.cancel()
            }
            s.emit(
                event,
                payload,
                Ack { args ->
                    task.cancel()
                    timer.cancel()
                    if (!cont.isActive) {
                        return@Ack
                    }
                    val result =
                        when (val first = args.firstOrNull()) {
                            is JSONObject -> first
                            is JSONArray -> JSONObject().put("ok", false).put("error", "Unexpected array ack")
                            null -> JSONObject().put("ok", false).put("error", "Empty ack")
                            else -> JSONObject().put("ok", false).put("error", first.toString())
                        }
                    cont.resume(result)
                },
            )
        }

    fun whenConnected(handler: () -> Unit): () -> Unit {
        val listener =
            Emitter.Listener {
                handler()
            }
        socket?.on(Socket.EVENT_CONNECT, listener)
        if (socket?.connected() == true) {
            handler()
        }
        return {
            socket?.off(Socket.EVENT_CONNECT, listener)
        }
    }
}
