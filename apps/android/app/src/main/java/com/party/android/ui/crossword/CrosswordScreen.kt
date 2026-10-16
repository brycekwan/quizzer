package com.party.android.ui.crossword

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import com.party.android.ui.components.PartyTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.party.android.ui.components.PartyButton
import com.party.android.ui.components.PartyButtonSize
import com.party.android.ui.components.PartyButtonVariant
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
fun CrosswordScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val state by repository.crossword.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var letterInput by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val ack = repository.subscribeCrossword()
        if (!ack.ok) error = ack.error
        repository.resumeCrossword()
    }
    DisposableEffect(Unit) {
        onDispose {
            scope.launch { repository.pauseCrossword() }
        }
    }

    PartyScaffold(title = "Crossword", onBack = onBack) { padding ->
        Column(
            modifier =
                padding
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val snap = state
            val clock =
                if (snap != null) {
                    formatDuration(liveElapsedMs(snap.elapsedMs, snap.activeSince))
                } else {
                    "0:00"
                }
            StatusLine(session.connected, clock)
            ErrorText(error)
            if (snap == null || snap.puzzle == null) {
                EmptyState("Loading puzzle…")
                return@Column
            }
            Text(snap.puzzle.title, style = MaterialTheme.typography.titleMedium)
            Text("Words ${snap.correctWordIds.size}/${snap.totalWords}")
            if (snap.completed) Text("Completed!", color = MaterialTheme.colorScheme.primary)

            Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                Column {
                    snap.puzzle.open.forEachIndexed { row, cols ->
                        Row {
                            cols.forEachIndexed { col, isOpen ->
                                val letter = snap.letters.getOrNull(row)?.getOrNull(col)
                                val number = snap.puzzle.cellNumbers.getOrNull(row)?.getOrNull(col)
                                val isSelected = selected == row to col
                                Box(
                                    modifier =
                                        Modifier
                                            .size(36.dp)
                                            .border(1.dp, MaterialTheme.colorScheme.outline)
                                            .background(
                                                when {
                                                    !isOpen -> Color.Black
                                                    isSelected -> MaterialTheme.colorScheme.primaryContainer
                                                    else -> MaterialTheme.colorScheme.surface
                                                },
                                            )
                                            .then(
                                                if (isOpen) {
                                                    Modifier.clickable { selected = row to col }
                                                } else {
                                                    Modifier
                                                },
                                            ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (isOpen) {
                                        if (number != null) {
                                            Text(
                                                "$number",
                                                fontSize = 8.sp,
                                                modifier = Modifier.align(Alignment.TopStart).padding(1.dp),
                                            )
                                        }
                                        Text(letter.orEmpty(), style = MaterialTheme.typography.titleMedium)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            selected?.let { (r, c) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PartyTextField(
                        value = letterInput,
                        onValueChange = {
                            letterInput = it.takeLast(1).uppercase()
                            if (letterInput.isNotEmpty()) {
                                scope.launch {
                                    val ack = repository.setCrosswordLetter(r, c, letterInput)
                                    if (!ack.ok) error = ack.error
                                    letterInput = ""
                                }
                            }
                        },
                        label = "Letter at $r,$c",
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    )
                    PartyButton(
                        onClick = {
                            scope.launch {
                                val ack = repository.clearCrosswordLetter(r, c)
                                if (!ack.ok) error = ack.error
                            }
                        },
                        variant = PartyButtonVariant.Outline,
                        size = PartyButtonSize.Sm,
                        fillMaxWidth = false,
                    ) { Text("Clear") }
                }
            }

            Text("Across", style = MaterialTheme.typography.titleSmall)
            snap.puzzle.across.forEach { clue ->
                Text("${clue.number}. ${clue.clue} (${clue.length})")
            }
            Text("Down", style = MaterialTheme.typography.titleSmall)
            snap.puzzle.down.forEach { clue ->
                Text("${clue.number}. ${clue.clue} (${clue.length})")
            }
        }
    }
}
