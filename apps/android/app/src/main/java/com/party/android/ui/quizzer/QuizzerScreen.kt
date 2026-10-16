package com.party.android.ui.quizzer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.EmptyState
import com.party.android.ui.components.ErrorText
import com.party.android.ui.components.PartyButton
import com.party.android.ui.components.PartyButtonVariant
import com.party.android.ui.components.PartyScaffold
import com.party.android.ui.components.StatusLine
import com.party.android.ui.theme.PartyColors
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
                    .verticalScroll(rememberScrollState()),
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
                color = PartyColors.Ink.copy(alpha = 0.6f),
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
                            val canAnswer = state.phase == "answering" && state.viewerAnswer == null
                            PartyButton(
                                onClick = {
                                    if (!canAnswer) return@PartyButton
                                    scope.launch {
                                        val ack = repository.answerQuiz(answer.id)
                                        if (!ack.ok) error = ack.error
                                    }
                                },
                                enabled = canAnswer,
                                variant =
                                    if (canAnswer) {
                                        PartyButtonVariant.Primary
                                    } else {
                                        PartyButtonVariant.Outline
                                    },
                            ) {
                                Text(label, fontWeight = FontWeight.Bold)
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
                                    color =
                                        if (va.correct == true) {
                                            PartyColors.Mint
                                        } else {
                                            PartyColors.Coral
                                        },
                                    fontWeight = FontWeight.Bold,
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
