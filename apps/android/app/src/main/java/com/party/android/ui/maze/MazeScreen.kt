package com.party.android.ui.maze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.EmptyState
import com.party.android.ui.components.ErrorText
import com.party.android.ui.components.PartyScaffold
import com.party.android.ui.components.StatusLine
import com.party.android.util.formatDuration
import com.party.android.util.liveElapsedMs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun MazeScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val state by repository.maze.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val ack = repository.subscribeMaze()
        if (!ack.ok) error = ack.error
    }

    LaunchedEffect(state?.phase, state?.splashUntil) {
        val snap = state ?: return@LaunchedEffect
        when (snap.phase) {
            "intro", "splash" -> repository.pauseMaze()
            "playing" -> repository.resumeMaze()
            else -> repository.pauseMaze()
        }
        val until = snap.splashUntil
        if (snap.phase == "splash" && until != null) {
            val wait = until - System.currentTimeMillis()
            if (wait > 0) delay(wait)
            repository.resumeMaze()
        }
    }

    DisposableEffect(Unit) {
        onDispose { scope.launch { repository.pauseMaze() } }
    }

    PartyScaffold(title = "Maze", onBack = onBack) { padding ->
        Column(
            modifier =
                padding
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val snap = state
            StatusLine(
                session.connected,
                if (snap != null) {
                    "${formatDuration(liveElapsedMs(snap.elapsedMs, snap.activeSince))} · ❤${snap.lives} · ${snap.score}"
                } else {
                    "0:00"
                },
            )
            ErrorText(error)
            if (snap == null) {
                EmptyState("Loading maze…")
                return@Column
            }
            Text("Level: ${snap.level} · Cleared ${snap.levelsCleared}", style = MaterialTheme.typography.titleMedium)
            Text("Phase: ${snap.phase}")

            when (snap.phase) {
                "intro" -> {
                    Text("Find the target. You cannot revisit cells. Three lives across the campaign.")
                    Button(onClick = {
                        scope.launch {
                            val ack = repository.mazeAckIntro()
                            if (!ack.ok) error = ack.error
                        }
                    }) { Text("OK") }
                }
                "splash" -> Text("Next level…")
                "won" -> Text("You won! Score ${snap.score}", color = MaterialTheme.colorScheme.primary)
                "lost" -> Text("Out of lives. Score ${snap.score}", color = MaterialTheme.colorScheme.error)
                "playing" -> {
                    val puzzle = snap.puzzle
                    if (puzzle == null) {
                        EmptyState("Waiting for maze grid…")
                    } else {
                        val visited = snap.visited.map { it.row to it.col }.toSet()
                        Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                            Column {
                                for (row in 0 until puzzle.rows) {
                                    Row {
                                        for (col in 0 until puzzle.cols) {
                                            val open = puzzle.open.getOrNull(row)?.getOrNull(col) == true
                                            val atPlayer = snap.position.row == row && snap.position.col == col
                                            val atTarget = puzzle.target.row == row && puzzle.target.col == col
                                            val wasVisited = visited.contains(row to col)
                                            Box(
                                                modifier =
                                                    Modifier
                                                        .size(18.dp)
                                                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant)
                                                        .background(
                                                            when {
                                                                !open -> Color.DarkGray
                                                                atPlayer -> MaterialTheme.colorScheme.primary
                                                                atTarget -> Color(0xFF22C55E)
                                                                wasVisited -> Color(0x3322C55E)
                                                                else -> MaterialTheme.colorScheme.surface
                                                            },
                                                        ),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("n" to "↑", "w" to "←", "s" to "↓", "e" to "→").forEach { (dir, label) ->
                                Button(onClick = {
                                    scope.launch {
                                        val ack = repository.mazeMove(dir)
                                        if (!ack.ok) error = ack.error
                                    }
                                }) { Text(label) }
                            }
                        }
                        Button(onClick = {
                            scope.launch {
                                val ack = repository.mazeRestart()
                                if (!ack.ok) error = ack.error
                            }
                        }) { Text("Restart level (spend life)") }
                    }
                }
            }
        }
    }
}
