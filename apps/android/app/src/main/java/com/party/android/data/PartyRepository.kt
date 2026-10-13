package com.party.android.data

import com.party.android.data.models.AckResult
import com.party.android.data.models.CrosswordPlayerSnapshot
import com.party.android.data.models.GameStateSnapshot
import com.party.android.data.models.MazePlayerSnapshot
import com.party.android.data.models.MazePuzzlePublic
import com.party.android.data.models.PartyLeaderboardSnapshot
import com.party.android.data.models.QUIZ_REMOVAL_REASON
import com.party.android.data.models.SYSTEM_REMOVAL_REASON
import com.party.android.data.models.SudokuPlayerSnapshot
import com.party.android.data.models.WordSearchPlayerSnapshot
import com.party.android.data.models.WordSurvivorPlayerSnapshot
import com.party.android.util.ServerUrlResult
import com.party.android.util.isValidPlayerName
import com.party.android.util.normalizePlayerName
import com.party.android.util.normalizeServerUrl
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

data class SessionState(
    val serverUrl: String? = null,
    val playerId: String? = null,
    val playerName: String? = null,
    val connected: Boolean = false,
    val kickedReason: String? = null,
    val systemRemoved: Boolean = false,
)

class PartyRepository(
    private val socket: PartySocket,
    private val sessionStore: SessionStore,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val connectMutex = Mutex()

    private val _session = MutableStateFlow(SessionState())
    val session: StateFlow<SessionState> = _session.asStateFlow()

    private val _game = MutableStateFlow<GameStateSnapshot?>(null)
    val game: StateFlow<GameStateSnapshot?> = _game.asStateFlow()

    private val _crossword = MutableStateFlow<CrosswordPlayerSnapshot?>(null)
    val crossword: StateFlow<CrosswordPlayerSnapshot?> = _crossword.asStateFlow()

    private val _wordSearch = MutableStateFlow<WordSearchPlayerSnapshot?>(null)
    val wordSearch: StateFlow<WordSearchPlayerSnapshot?> = _wordSearch.asStateFlow()

    private val _sudoku = MutableStateFlow<SudokuPlayerSnapshot?>(null)
    val sudoku: StateFlow<SudokuPlayerSnapshot?> = _sudoku.asStateFlow()

    private val _maze = MutableStateFlow<MazePlayerSnapshot?>(null)
    val maze: StateFlow<MazePlayerSnapshot?> = _maze.asStateFlow()
    private var cachedMazePuzzle: MazePuzzlePublic? = null

    private val _wordSurvivor = MutableStateFlow<WordSurvivorPlayerSnapshot?>(null)
    val wordSurvivor: StateFlow<WordSurvivorPlayerSnapshot?> = _wordSurvivor.asStateFlow()

    private val _leaderboard = MutableStateFlow<PartyLeaderboardSnapshot?>(null)
    val leaderboard: StateFlow<PartyLeaderboardSnapshot?> = _leaderboard.asStateFlow()

    private var detachConnect: (() -> Unit)? = null

    private val onConnect =
        Emitter.Listener {
            _session.value = _session.value.copy(connected = true)
            scope.launch { rejoinIfNeeded() }
        }

    private val onDisconnect =
        Emitter.Listener {
            _session.value = _session.value.copy(connected = false)
        }

    private val onKicked =
        Emitter.Listener { args ->
            val reason =
                (args.firstOrNull() as? JSONObject)?.optString("reason")?.takeIf { it.isNotBlank() }
            when (reason) {
                SYSTEM_REMOVAL_REASON -> {
                    scope.launch {
                        sessionStore.clearSession()
                        _session.value =
                            _session.value.copy(
                                playerId = null,
                                playerName = null,
                                systemRemoved = true,
                                kickedReason = reason,
                            )
                    }
                }
                QUIZ_REMOVAL_REASON -> {
                    // Leave quiz only; session kept.
                    _game.value = null
                }
                else -> {
                    scope.launch {
                        sessionStore.clearSession()
                        _session.value =
                            _session.value.copy(
                                playerId = null,
                                playerName = null,
                                kickedReason = reason ?: "Disconnected",
                            )
                    }
                }
            }
        }

    private val onGameState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _game.value = it.decode() }
        }

    private val onGameReset =
        Emitter.Listener {
            _game.value = null
        }

    private val onCrosswordState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _crossword.value = it.decode() }
        }

    private val onWordSearchState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _wordSearch.value = it.decode() }
        }

    private val onSudokuState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _sudoku.value = it.decode() }
        }

    private val onMazeState =
        Emitter.Listener { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@Listener
            val snap: MazePlayerSnapshot = obj.decode()
            if (snap.puzzle != null) {
                cachedMazePuzzle = snap.puzzle
                _maze.value = snap
            } else {
                _maze.value = snap.copy(puzzle = cachedMazePuzzle)
            }
        }

    private val onWordSurvivorState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _wordSurvivor.value = it.decode() }
        }

    private val onLeaderboardState =
        Emitter.Listener { args ->
            (args.firstOrNull() as? JSONObject)?.let { _leaderboard.value = it.decode() }
        }

    init {
        scope.launch {
            val stored = sessionStore.session.first()
            _session.value =
                SessionState(
                    serverUrl = stored.serverUrl,
                    playerId = stored.playerId,
                    playerName = stored.playerName,
                )
            if (!stored.serverUrl.isNullOrBlank() && !stored.playerId.isNullOrBlank() && !stored.playerName.isNullOrBlank()) {
                connectInternal(stored.serverUrl)
            }
        }
    }

    suspend fun login(
        serverUrlRaw: String,
        nameRaw: String,
    ): AckResult {
        val url =
            when (val n = normalizeServerUrl(serverUrlRaw)) {
                is ServerUrlResult.Ok -> n.url
                is ServerUrlResult.Err -> return AckResult(ok = false, error = n.message)
            }
        if (!isValidPlayerName(nameRaw)) {
            return AckResult(ok = false, error = "Name must be 1–24 characters")
        }
        val name = normalizePlayerName(nameRaw)

        connectMutex.withLock {
            val previousUrl = socket.currentUrl
            if (previousUrl != null && previousUrl != url) {
                sessionStore.clearPlayerId()
                _session.value = _session.value.copy(playerId = null, serverUrl = url)
            }
            connectInternal(url)
            waitUntilConnected(8_000)
        }

        val payload =
            JSONObject()
                .put("name", name)
                .apply {
                    val id = _session.value.playerId
                    if (!id.isNullOrBlank() && socket.currentUrl == url) {
                        put("playerId", id)
                    }
                }

        val ackJson = socket.emitAck("session:login", payload)
        val ack = ackJson.decode<AckResult>()
        if (ack.ok && ack.playerId != null && ack.name != null) {
            sessionStore.saveLogin(url, ack.playerId, ack.name)
            _session.value =
                SessionState(
                    serverUrl = url,
                    playerId = ack.playerId,
                    playerName = ack.name,
                    connected = socket.connected,
                    systemRemoved = false,
                    kickedReason = null,
                )
        } else {
            sessionStore.saveServerUrl(url)
            _session.value = _session.value.copy(serverUrl = url, kickedReason = ack.error)
        }
        return ack
    }

    fun clearKickFlags() {
        _session.value = _session.value.copy(kickedReason = null, systemRemoved = false)
    }

    suspend fun logout() {
        sessionStore.clearSession()
        socket.disconnect()
        detachListeners()
        _session.value = SessionState(serverUrl = _session.value.serverUrl)
        clearGameStates()
    }

    private fun clearGameStates() {
        _game.value = null
        _crossword.value = null
        _wordSearch.value = null
        _sudoku.value = null
        _maze.value = null
        cachedMazePuzzle = null
        _wordSurvivor.value = null
        _leaderboard.value = null
    }

    private fun connectInternal(url: String) {
        detachListeners()
        socket.connect(url)
        attachListeners()
        _session.value = _session.value.copy(serverUrl = url, connected = socket.connected)
    }

    private fun attachListeners() {
        socket.on(Socket.EVENT_CONNECT, onConnect)
        socket.on(Socket.EVENT_DISCONNECT, onDisconnect)
        socket.on("player:kicked", onKicked)
        socket.on("game:state", onGameState)
        socket.on("game:reset", onGameReset)
        socket.on("crossword:state", onCrosswordState)
        socket.on("wordsearch:state", onWordSearchState)
        socket.on("sudoku:state", onSudokuState)
        socket.on("maze:state", onMazeState)
        socket.on("wordsurvivor:state", onWordSurvivorState)
        socket.on("leaderboard:state", onLeaderboardState)
        detachConnect = socket.whenConnected { }
    }

    private fun detachListeners() {
        detachConnect?.invoke()
        detachConnect = null
        socket.off(Socket.EVENT_CONNECT, onConnect)
        socket.off(Socket.EVENT_DISCONNECT, onDisconnect)
        socket.off("player:kicked", onKicked)
        socket.off("game:state", onGameState)
        socket.off("game:reset", onGameReset)
        socket.off("crossword:state", onCrosswordState)
        socket.off("wordsearch:state", onWordSearchState)
        socket.off("sudoku:state", onSudokuState)
        socket.off("maze:state", onMazeState)
        socket.off("wordsurvivor:state", onWordSurvivorState)
        socket.off("leaderboard:state", onLeaderboardState)
    }

    private suspend fun rejoinIfNeeded() {
        val id = _session.value.playerId
        val name = _session.value.playerName
        if (id.isNullOrBlank() || name.isNullOrBlank()) {
            return
        }
        val ack =
            socket.emitAck(
                "session:login",
                JSONObject().put("name", name).put("playerId", id),
            ).decode<AckResult>()
        if (ack.ok && ack.playerId != null && ack.name != null) {
            val url = _session.value.serverUrl ?: return
            sessionStore.saveLogin(url, ack.playerId, ack.name)
            _session.value =
                _session.value.copy(
                    playerId = ack.playerId,
                    playerName = ack.name,
                    connected = true,
                )
        } else {
            sessionStore.clearSession()
            _session.value =
                _session.value.copy(
                    playerId = null,
                    playerName = null,
                    kickedReason = ack.error,
                )
        }
    }

    private suspend fun waitUntilConnected(timeoutMs: Long) {
        val start = System.currentTimeMillis()
        while (!socket.connected && System.currentTimeMillis() - start < timeoutMs) {
            kotlinx.coroutines.delay(50)
        }
    }

    // --- Quizzer ---
    suspend fun joinQuiz(): AckResult {
        val s = _session.value
        val name = s.playerName ?: return AckResult(ok = false, error = "Not logged in")
        val id = s.playerId ?: return AckResult(ok = false, error = "Not logged in")
        return socket
            .emitAck("player:join", JSONObject().put("name", name).put("playerId", id))
            .decode()
    }

    suspend fun answerQuiz(answerId: String): AckResult =
        socket.emitAck("player:answer", JSONObject().put("answerId", answerId)).decode()

    // --- Crossword ---
    suspend fun subscribeCrossword(): AckResult = socket.emitAck("crossword:subscribe").decode()

    suspend fun setCrosswordLetter(
        row: Int,
        col: Int,
        letter: String,
    ): AckResult =
        socket
            .emitAck(
                "crossword:setLetter",
                JSONObject().put("row", row).put("col", col).put("letter", letter),
            ).decode()

    suspend fun clearCrosswordLetter(
        row: Int,
        col: Int,
    ): AckResult =
        socket
            .emitAck("crossword:clearLetter", JSONObject().put("row", row).put("col", col))
            .decode()

    suspend fun pauseCrossword(): AckResult = socket.emitAck("crossword:pauseTimer").decode()

    suspend fun resumeCrossword(): AckResult = socket.emitAck("crossword:resumeTimer").decode()

    // --- Word search ---
    suspend fun subscribeWordSearch(): AckResult = socket.emitAck("wordsearch:subscribe").decode()

    suspend fun submitWordSearch(cells: List<Pair<Int, Int>>): AckResult {
        val arr = JSONArray()
        cells.forEach { (r, c) -> arr.put(JSONObject().put("row", r).put("col", c)) }
        return socket.emitAck("wordsearch:submitSelection", JSONObject().put("cells", arr)).decode()
    }

    suspend fun pauseWordSearch(): AckResult = socket.emitAck("wordsearch:pauseTimer").decode()

    suspend fun resumeWordSearch(): AckResult = socket.emitAck("wordsearch:resumeTimer").decode()

    // --- Sudoku ---
    suspend fun subscribeSudoku(): AckResult = socket.emitAck("sudoku:subscribe").decode()

    suspend fun sudokuCommit(
        row: Int,
        col: Int,
        value: Int,
    ): AckResult =
        socket
            .emitAck("sudoku:commit", JSONObject().put("row", row).put("col", col).put("value", value))
            .decode()

    suspend fun sudokuDraft(
        row: Int,
        col: Int,
        value: Int,
    ): AckResult =
        socket
            .emitAck("sudoku:draft", JSONObject().put("row", row).put("col", col).put("value", value))
            .decode()

    suspend fun sudokuErase(
        row: Int,
        col: Int,
    ): AckResult =
        socket.emitAck("sudoku:erase", JSONObject().put("row", row).put("col", col)).decode()

    suspend fun sudokuHint(
        row: Int? = null,
        col: Int? = null,
    ): AckResult {
        val payload = JSONObject()
        if (row != null && col != null) {
            payload.put("row", row).put("col", col)
        }
        return socket.emitAck("sudoku:hint", payload).decode()
    }

    suspend fun pauseSudoku(): AckResult = socket.emitAck("sudoku:pauseTimer").decode()

    suspend fun resumeSudoku(): AckResult = socket.emitAck("sudoku:resumeTimer").decode()

    // --- Maze ---
    suspend fun subscribeMaze(): AckResult = socket.emitAck("maze:subscribe").decode()

    suspend fun mazeAckIntro(): AckResult = socket.emitAck("maze:ackIntro").decode()

    suspend fun mazeMove(direction: String): AckResult =
        socket.emitAck("maze:move", JSONObject().put("direction", direction)).decode()

    suspend fun mazeRestart(): AckResult = socket.emitAck("maze:restart").decode()

    suspend fun pauseMaze(): AckResult = socket.emitAck("maze:pauseTimer").decode()

    suspend fun resumeMaze(): AckResult = socket.emitAck("maze:resumeTimer").decode()

    // --- Word survivor ---
    suspend fun subscribeWordSurvivor(): AckResult = socket.emitAck("wordsurvivor:subscribe").decode()

    suspend fun wordSurvivorAckIntro(): AckResult = socket.emitAck("wordsurvivor:ackIntro").decode()

    suspend fun wordSurvivorLetter(letter: String): AckResult =
        socket.emitAck("wordsurvivor:letter", JSONObject().put("letter", letter)).decode()

    suspend fun wordSurvivorBackspace(): AckResult = socket.emitAck("wordsurvivor:backspace").decode()

    suspend fun wordSurvivorSubmit(): AckResult = socket.emitAck("wordsurvivor:submit").decode()

    suspend fun pauseWordSurvivor(): AckResult = socket.emitAck("wordsurvivor:pauseTimer").decode()

    suspend fun resumeWordSurvivor(): AckResult = socket.emitAck("wordsurvivor:resumeTimer").decode()

    // --- Leaderboard ---
    suspend fun subscribeLeaderboard(): AckResult = socket.emitAck("leaderboard:subscribe").decode()

    fun refreshConnection() {
        val url = _session.value.serverUrl ?: return
        if (!socket.connected) {
            connectInternal(url)
        }
    }
}
