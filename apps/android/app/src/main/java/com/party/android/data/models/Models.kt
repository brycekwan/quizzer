package com.party.android.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

const val SYSTEM_REMOVAL_REASON = "Removed from the system by admin"
const val QUIZ_REMOVAL_REASON = "Removed from the quiz game"
const val IDLE_TIMEOUT_REASON = "Signed out due to inactivity"
const val LOGIN_LOCKED_REASON = "Signed out because logins are closed"

@Serializable
data class AckResult(
    val ok: Boolean = false,
    val error: String? = null,
    val playerId: String? = null,
    val name: String? = null,
    val matched: Boolean? = null,
    val correct: Boolean? = null,
    val correctWordIds: List<String>? = null,
    val message: String? = null,
)

@Serializable
data class AnswerOption(
    val id: String,
    val text: String,
    val correct: Boolean? = null,
)

@Serializable
data class QuestionPublic(
    val id: String,
    val question: String,
    val answers: List<AnswerOption> = emptyList(),
    val index: Int = 0,
    val total: Int = 0,
    val multiplier: Int? = null,
)

@Serializable
data class ViewerAnswer(
    val answerId: String,
    val points: Int? = null,
    val correct: Boolean? = null,
)

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val id: String,
    val name: String,
    val score: Int,
)

@Serializable
data class GameStateSnapshot(
    val status: String = "waiting",
    val phase: String? = null,
    val currentQuestion: QuestionPublic? = null,
    val questionEndsAt: Long? = null,
    val phaseEndsAt: Long? = null,
    val serverNow: Long = 0,
    val remainingMs: Long = 0,
    val viewerAnswer: ViewerAnswer? = null,
    val waitingPlayerCount: Int = 0,
    val answeredPlayerCount: Int = 0,
    val totalPlayerCount: Int = 0,
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val viewerFinishedGame: Boolean = false,
    val scheduledStartAt: Long? = null,
    val questionIndex: Int = 0,
    val totalQuestions: Int = 0,
)

@Serializable
data class CrosswordClue(
    val id: String? = null,
    val number: Int = 0,
    val row: Int = 0,
    val col: Int = 0,
    val clue: String = "",
    val length: Int = 0,
)

@Serializable
data class CrosswordPuzzlePublic(
    val id: String = "",
    val title: String = "",
    val rows: Int = 0,
    val cols: Int = 0,
    /** `true` = letter cell, `false` = block */
    val open: List<List<Boolean>> = emptyList(),
    val cellNumbers: List<List<Int?>> = emptyList(),
    val across: List<CrosswordClue> = emptyList(),
    val down: List<CrosswordClue> = emptyList(),
)

@Serializable
data class CrosswordPlayerSnapshot(
    val puzzle: CrosswordPuzzlePublic? = null,
    val letters: List<List<String?>> = emptyList(),
    val correctWordIds: List<String> = emptyList(),
    val completed: Boolean = false,
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
    val completedAt: Long? = null,
    val totalWords: Int = 0,
)

@Serializable
data class WordSearchFound(
    val id: String = "",
    val word: String = "",
    val cells: List<CellRef> = emptyList(),
)

@Serializable
data class CellRef(
    val row: Int,
    val col: Int,
)

@Serializable
data class WordSearchPuzzlePublic(
    val id: String = "",
    val title: String = "",
    val grid: List<List<String>> = emptyList(),
    val words: List<String> = emptyList(),
)

@Serializable
data class WordSearchPlayerSnapshot(
    val puzzle: WordSearchPuzzlePublic? = null,
    val found: List<WordSearchFound> = emptyList(),
    val completed: Boolean = false,
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
    val completedAt: Long? = null,
    val totalWords: Int = 0,
)

@Serializable
data class SudokuCell(
    val given: Boolean = false,
    val value: Int? = null,
    val solved: Boolean = false,
    val hinted: Boolean = false,
    val wrong: Boolean = false,
    val drafts: List<Int> = emptyList(),
    val wrongDrafts: List<Int> = emptyList(),
)

@Serializable
data class SudokuPuzzlePublic(
    val id: String = "",
    val title: String = "",
    val alphabet: List<String> = emptyList(),
)

@Serializable
data class SudokuPlayerSnapshot(
    val puzzle: SudokuPuzzlePublic? = null,
    val cells: List<List<SudokuCell>> = emptyList(),
    val score: Int = 0,
    val hintsUsed: Int = 0,
    val hintsMax: Int = 3,
    val completed: Boolean = false,
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
    val completedAt: Long? = null,
)

@Serializable
data class MazeWalls(
    val n: Boolean = true,
    val e: Boolean = true,
    val s: Boolean = true,
    val w: Boolean = true,
)

@Serializable
data class MazeCoord(
    val row: Int = 0,
    val col: Int = 0,
)

@Serializable
data class MazePuzzlePublic(
    val id: String = "",
    val title: String = "",
    val rows: Int = 0,
    val cols: Int = 0,
    val start: MazeCoord = MazeCoord(),
    val target: MazeCoord = MazeCoord(),
    val open: List<List<Boolean>> = emptyList(),
    val walls: List<List<MazeWalls>> = emptyList(),
)

@Serializable
data class MazePlayerSnapshot(
    val level: String = "easy",
    val puzzle: MazePuzzlePublic? = null,
    val position: MazeCoord = MazeCoord(),
    val visited: List<MazeCoord> = emptyList(),
    val lives: Int = 3,
    val score: Int = 0,
    val phase: String = "intro",
    val splashUntil: Long? = null,
    val levelsCleared: Int = 0,
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
    val completedAt: Long? = null,
)

@Serializable
data class WordSurvivorGuess(
    val word: String = "",
    val marks: List<String> = emptyList(),
)

@Serializable
data class WordSurvivorPlayerSnapshot(
    val wordNumber: Int = 1,
    val wordCount: Int = 25,
    val length: Int = 5,
    val guesses: List<WordSurvivorGuess> = emptyList(),
    val draft: String = "",
    val score: Int = 0,
    val phase: String = "intro",
    val topic: String = "",
    val splashUntil: Long? = null,
    val revealUntil: Long? = null,
    val wordsCleared: Int = 0,
    val maxGuesses: Int = 5,
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
    val completedAt: Long? = null,
    val answer: String? = null,
)

@Serializable
data class PlayClock(
    val elapsedMs: Long = 0,
    val activeSince: Long? = null,
)

@Serializable
data class LeaderboardRow(
    val rank: Int = 0,
    val playerId: String = "",
    val name: String = "",
    val score: Int = 0,
    val quizScore: Int? = null,
    val clocks: List<PlayClock> = emptyList(),
)

@Serializable
data class PartyLeaderboardSnapshot(
    val overall: List<LeaderboardRow> = emptyList(),
    val crossword: List<LeaderboardRow> = emptyList(),
    val wordSearch: List<LeaderboardRow> = emptyList(),
    val sudoku: List<LeaderboardRow> = emptyList(),
    val maze: List<LeaderboardRow> = emptyList(),
    val wordSurvivor: List<LeaderboardRow> = emptyList(),
    val quiz: List<LeaderboardRow> = emptyList(),
)

/** Catch-all for optional JSON fields we do not model. */
@Serializable
data class JsonBag(val value: JsonElement? = null)
