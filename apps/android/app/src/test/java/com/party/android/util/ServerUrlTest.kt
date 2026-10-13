package com.party.android.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlTest {
    @Test
    fun normalizesTrailingSlashAndAddsScheme() {
        val result = normalizeServerUrl("10.0.2.2:8080/")
        assertTrue(result is ServerUrlResult.Ok)
        assertEquals("http://10.0.2.2:8080", (result as ServerUrlResult.Ok).url)
    }

    @Test
    fun keepsHttps() {
        val result = normalizeServerUrl("https://party.example.com/")
        assertTrue(result is ServerUrlResult.Ok)
        assertEquals("https://party.example.com", (result as ServerUrlResult.Ok).url)
    }

    @Test
    fun rejectsBlank() {
        val result = normalizeServerUrl("   ")
        assertTrue(result is ServerUrlResult.Err)
    }

    @Test
    fun validatesPlayerNames() {
        assertTrue(isValidPlayerName("Ada"))
        assertTrue(!isValidPlayerName(""))
        assertTrue(!isValidPlayerName("x".repeat(25)))
        assertEquals("Ada Lovelace", normalizePlayerName("  Ada   Lovelace "))
    }
}

class PlayClockTest {
    @Test
    fun liveElapsedAddsActiveDelta() {
        assertEquals(1500L, liveElapsedMs(1000, 2000, nowMs = 2500))
        assertEquals(1000L, liveElapsedMs(1000, null, nowMs = 2500))
    }

    @Test
    fun formatsDuration() {
        assertEquals("1:05", formatDuration(65_000))
        assertEquals("0:00", formatDuration(0))
    }
}
