package com.party.android.ui.quizzer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.EmptyState
import com.party.android.ui.components.ErrorText
import com.party.android.ui.components.PartyScaffold
import com.party.android.ui.components.StatusLine
import kotlinx.coroutines.launch

@Composable
fun QuizzerScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val game by repository.game.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val join = repository.joinQuiz()
        if (!join.ok) {
            error = join.error
        }
    }

    PartyScaffold(title = "Quizzer", onBack = onBack) { padding ->
        Column(
            modifier =
                padding
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StatusLine(session.connected, "Q ${(game?.questionIndex ?: 0) + 1}/${game?.totalQuestions ?: 0}")
            ErrorText(error)
            val state = game
            if (state == null) {
                EmptyState("Waiting for game state…")
                return@Column
            }
            Text("Status: ${state.status}", style = MaterialTheme.typography.labelLarge)
            if (state.phase != null) {
                Text("Phase: ${state.phase}")
            }
            if (state.scheduledStartAt != null && state.status == "waiting") {
                Text("Scheduled start pending…")
            }
            Text(
                "Players answered ${state.answeredPlayerCount}/${state.totalPlayerCount}",
                style = MaterialTheme.typography.bodySmall,
            )
            when (state.phase) {
                "multiplier" -> {
                    Text(
                        "${state.currentQuestion?.multiplier ?: 2}× points",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                }
                "answering", "reveal" -> {
                    val q = state.currentQuestion
                    if (q != null) {
                        Text(q.question, style = MaterialTheme.typography.titleLarge)
                        Text("Time left: ${(state.remainingMs / 1000).coerceAtLeast(0)}s")
                        q.answers.forEach { answer ->
                            val selected = state.viewerAnswer?.answerId == answer.id
                            val label =
                                buildString {
                                    append(answer.text)
                                    if (state.phase == "reveal" && answer.correct == true) append(" ✓")
                                    if (selected) append(" (you)")
                                }
                            if (state.phase == "answering" && state.viewerAnswer == null) {
                                Button(
                                    onClick = {
                                        scope.launch {
                                            val ack = repository.answerQuiz(answer.id)
                                            if (!ack.ok) error = ack.error
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text(label) }
                            } else {
                                OutlinedButton(
                                    onClick = {},
                                    enabled = false,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text(label) }
                            }
                        }
                        state.viewerAnswer?.let { va ->
                            if (state.phase == "reveal") {
                                Text(
                                    if (va.correct == true) {
                                        "Correct! +${va.points ?: 0}"
                                    } else {
                                        "Incorrect"
                                    },
                                )
                            }
                        }
                    }
                }
                "leaderboard" -> {
                    Text("Leaderboard", style = MaterialTheme.typography.titleMedium)
                    state.leaderboard.forEach { row ->
                        Text("${row.rank}. ${row.name} — ${row.score}")
                    }
                }
                else -> {
                    if (state.status == "finished") {
                        if (state.viewerFinishedGame) {
                            Text("Game finished", style = MaterialTheme.typography.titleMedium)
                            state.leaderboard.forEach { row ->
                                Text("${row.rank}. ${row.name} — ${row.score}")
                            }
                        } else {
                            EmptyState("Waiting for the next game…")
                        }
                    } else {
                        EmptyState("Waiting for the host to start…")
                    }
                }
            }
        }
    }
}
