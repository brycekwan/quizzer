package com.party.android.data

import com.party.android.data.models.GameStateSnapshot
import com.party.android.data.models.PartyLeaderboardSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ModelsDecodeTest {
    @Test
    fun decodesGameStateIgnoringUnknownKeys() {
        val json =
            """
            {
              "status": "active",
              "phase": "answering",
              "remainingMs": 12000,
              "questionIndex": 0,
              "totalQuestions": 5,
              "waitingPlayerCount": 1,
              "answeredPlayerCount": 0,
              "totalPlayerCount": 1,
              "serverNow": 1,
              "leaderboard": [],
              "viewerFinishedGame": false,
              "extraFutureField": true
            }
            """.trimIndent()
        val state = partyJson.decodeFromString<GameStateSnapshot>(json)
        assertEquals("active", state.status)
        assertEquals("answering", state.phase)
        assertEquals(12000L, state.remainingMs)
        assertNull(state.currentQuestion)
    }

    @Test
    fun decodesLeaderboardBoards() {
        val json =
            """
            {
              "overall": [{"rank":1,"playerId":"a","name":"Ada","score":10,"quizScore":null,"clocks":[]}],
              "crossword": [],
              "wordSearch": [],
              "sudoku": [],
              "maze": [],
              "wordSurvivor": [],
              "quiz": []
            }
            """.trimIndent()
        val board = partyJson.decodeFromString<PartyLeaderboardSnapshot>(json)
        assertEquals(1, board.overall.size)
        assertEquals("Ada", board.overall[0].name)
    }
}
