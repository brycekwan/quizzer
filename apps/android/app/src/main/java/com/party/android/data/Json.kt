package com.party.android.data

import kotlinx.serialization.json.Json
import org.json.JSONObject

val partyJson =
    Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

inline fun <reified T> JSONObject.decode(): T = partyJson.decodeFromString(toString())

fun JSONObject.ackOk(): Boolean = optBoolean("ok", false)

fun JSONObject.ackError(): String = optString("error", "Request failed")
