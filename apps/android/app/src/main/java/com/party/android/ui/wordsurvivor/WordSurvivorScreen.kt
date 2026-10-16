package com.party.android.ui.wordsurvivor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.text.font.FontWeight
import com.party.android.ui.components.PartyButton
import com.party.android.ui.components.PartyButtonSize
import com.party.android.ui.components.PartyButtonVariant
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
import androidx.compose.ui.Alignment
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
import kotlinx.coroutines.launch

@Composable
fun WordSurvivorScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val state by repository.wordSurvivor.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val ack = repository.subscribeWordSurvivor()
        if (!ack.ok) error = ack.error
    }

    // The server ends the reveal and splash on its own clock and pushes the new phase.
    LaunchedEffect(state?.phase) {
        val snap = state ?: return@LaunchedEffect
        if (snap.phase == "playing") repository.resumeWordSurvivor() else repository.pauseWordSurvivor()
    }

    DisposableEffect(Unit) {
        onDispose { scope.launch { repository.pauseWordSurvivor() } }
    }

    PartyScaffold(title = "Word Survivor", onBack = onBack) { padding ->
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
                    "${formatDuration(liveElapsedMs(snap.elapsedMs, snap.activeSince))} · ${snap.score}"
                } else {
                    "0:00"
                },
            )
            ErrorText(error)
            if (snap == null) {
                EmptyState("Loading…")
                return@Column
            }
            if (snap.topic.isNotBlank()) {
                Text(snap.topic, style = MaterialTheme.typography.titleMedium)
            }
            Text("Word ${snap.wordNumber}/${snap.wordCount} · length ${snap.length}")
            Text("Phase: ${snap.phase}")

            when (snap.phase) {
                "intro" -> {
                    Text("Guess ${snap.maxGuesses} times per word. Clear all 25 to win.")
                    PartyButton(onClick = {
                        scope.launch {
                            val ack = repository.wordSurvivorAckIntro()
                            if (!ack.ok) error = ack.error
                        }
                    }) { Text("OK") }
                }
                "won" -> Text("You cleared every word! Score ${snap.score}", color = MaterialTheme.colorScheme.primary)
                "lost" -> Text("Out of guesses. Answer was ${snap.answer.orEmpty()}. Score ${snap.score}")
                "splash" -> Text("Next word…")
                "reveal", "playing" -> {
                    snap.guesses.forEach { guess ->
                        Row {
                            guess.word.forEachIndexed { i, ch ->
                                val mark = guess.marks.getOrNull(i) ?: "absent"
                                val bg =
                                    when (mark) {
                                        "correct" -> Color(0xFF22C55E)
                                        "present" -> Color(0xFFEAB308)
                                        else -> Color(0xFF64748B)
                                    }
                                Box(
                                    modifier =
                                        Modifier
                                            .padding(2.dp)
                                            .size(36.dp)
                                            .background(bg)
                                            .border(1.dp, Color.Black),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(ch.uppercaseChar().toString(), color = Color.White)
                                }
                            }
                        }
                    }
                    // Draft row
                    Row {
                        repeat(snap.length) { i ->
                            val ch = snap.draft.getOrNull(i)?.uppercaseChar()?.toString().orEmpty()
                            Box(
                                modifier =
                                    Modifier
                                        .padding(2.dp)
                                        .size(36.dp)
                                        .border(2.dp, MaterialTheme.colorScheme.primary),
                                contentAlignment = Alignment.Center,
                            ) { Text(ch) }
                        }
                    }
                    if (snap.phase == "playing") {
                        val rows =
                            listOf(
                                "QWERTYUIOP",
                                "ASDFGHJKL",
                                "ZXCVBNM",
                            )
                        rows.forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.Center,
                            ) {
                                row.forEach { ch ->
                                    PartyButton(
                                        onClick = {
                                            scope.launch {
                                                val ack = repository.wordSurvivorLetter(ch.toString())
                                                if (!ack.ok) error = ack.error
                                            }
                                        },
                                        modifier = Modifier.padding(1.dp),
                                        fillMaxWidth = false,
                                        size = PartyButtonSize.Sm,
                                    ) { Text(ch.toString()) }
                                }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PartyButton(
                                onClick = {
                                    scope.launch {
                                        val ack = repository.wordSurvivorBackspace()
                                        if (!ack.ok) error = ack.error
                                    }
                                },
                                variant = PartyButtonVariant.Outline,
                                fillMaxWidth = false,
                            ) { Text("⌫") }
                            PartyButton(
                                onClick = {
                                    scope.launch {
                                        val ack = repository.wordSurvivorSubmit()
                                        if (!ack.ok) error = ack.error
                                    }
                                },
                                fillMaxWidth = false,
                            ) { Text("Enter") }
                        }
                    }
                }
            }
        }
    }
}
