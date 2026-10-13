package com.party.android.util

fun liveElapsedMs(elapsedMs: Long, activeSince: Long?, nowMs: Long = System.currentTimeMillis()): Long {
    if (activeSince == null) {
        return elapsedMs
    }
    return elapsedMs + (nowMs - activeSince).coerceAtLeast(0)
}

fun formatDuration(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val m = totalSec / 60
    val s = totalSec % 60
    return "%d:%02d".format(m, s)
}
