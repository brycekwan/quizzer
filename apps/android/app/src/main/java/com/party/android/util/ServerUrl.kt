package com.party.android.util

sealed class ServerUrlResult {
    data class Ok(val url: String) : ServerUrlResult()
    data class Err(val message: String) : ServerUrlResult()
}

/** Normalize a user-entered party server base URL. */
fun normalizeServerUrl(raw: String): ServerUrlResult {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) {
        return ServerUrlResult.Err("Enter a server URL")
    }
    val withScheme =
        when {
            trimmed.startsWith("http://", ignoreCase = true) ||
                trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            else -> "http://$trimmed"
        }
    val noTrailing = withScheme.trimEnd('/')
    val uri =
        try {
            java.net.URI(noTrailing)
        } catch (_: Exception) {
            return ServerUrlResult.Err("Invalid server URL")
        }
    if (uri.scheme != "http" && uri.scheme != "https") {
        return ServerUrlResult.Err("URL must start with http:// or https://")
    }
    if (uri.host.isNullOrBlank()) {
        return ServerUrlResult.Err("Invalid server URL")
    }
    return ServerUrlResult.Ok(noTrailing)
}

fun normalizePlayerName(name: String): String = name.trim().replace(Regex("\\s+"), " ")

fun isValidPlayerName(name: String): Boolean {
    val normalized = normalizePlayerName(name)
    return normalized.length in 1..24
}
