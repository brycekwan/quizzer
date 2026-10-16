package com.party.android.ui.sudoku

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.FilterChip
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
fun SudokuScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val state by repository.sudoku.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var draftMode by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val ack = repository.subscribeSudoku()
        if (!ack.ok) error = ack.error
        repository.resumeSudoku()
    }
    DisposableEffect(Unit) {
        onDispose { scope.launch { repository.pauseSudoku() } }
    }

    PartyScaffold(title = "Sudoku", onBack = onBack) { padding ->
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
                    "${formatDuration(liveElapsedMs(snap.elapsedMs, snap.activeSince))} · ${snap.score} pts"
                } else {
                    "0:00"
                },
            )
            ErrorText(error)
            if (snap == null || snap.cells.isEmpty()) {
                EmptyState("Loading puzzle…")
                return@Column
            }
            Text(snap.puzzle?.title.orEmpty(), style = MaterialTheme.typography.titleMedium)
            Text("Hints ${snap.hintsUsed}/${snap.hintsMax}")
            if (snap.completed) Text("Completed!", color = MaterialTheme.colorScheme.primary)

            val alphabet = snap.puzzle?.alphabet?.takeIf { it.size == 9 } ?: (1..9).map { it.toString() }

            Column {
                snap.cells.forEachIndexed { row, cols ->
                    Row {
                        cols.forEachIndexed { col, cell ->
                            val isSelected = selected == row to col
                            val thickLeft = col % 3 == 0
                            val thickTop = row % 3 == 0
                            Box(
                                modifier =
                                    Modifier
                                        .size(36.dp)
                                        .border(
                                            if (thickLeft || thickTop) 2.dp else 1.dp,
                                            MaterialTheme.colorScheme.outline,
                                        )
                                        .background(
                                            when {
                                                cell.wrong -> Color(0x33EF4444)
                                                cell.solved || cell.hinted -> Color(0x3322C55E)
                                                isSelected -> MaterialTheme.colorScheme.primaryContainer
                                                else -> MaterialTheme.colorScheme.surface
                                            },
                                        )
                                        .clickable(enabled = !cell.given && !cell.solved) {
                                            selected = row to col
                                        },
                                contentAlignment = Alignment.Center,
                            ) {
                                val label =
                                    cell.value?.let { v ->
                                        alphabet.getOrNull(v - 1) ?: v.toString()
                                    }
                                if (label != null) {
                                    Text(
                                        label,
                                        style = MaterialTheme.typography.titleMedium,
                                        color =
                                            if (cell.given) {
                                                MaterialTheme.colorScheme.onSurface
                                            } else {
                                                MaterialTheme.colorScheme.primary
                                            },
                                    )
                                } else if (cell.drafts.isNotEmpty()) {
                                    Text(
                                        cell.drafts.sorted().joinToString("") { d ->
                                            alphabet.getOrNull(d - 1) ?: d.toString()
                                        },
                                        fontSize = 8.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            FilterChip(
                selected = draftMode,
                onClick = { draftMode = !draftMode },
                label = { Text(if (draftMode) "Notes on" else "Notes off") },
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                (1..9).forEach { value ->
                    PartyButton(
                        onClick = {
                            val sel = selected ?: return@PartyButton
                            scope.launch {
                                val ack =
                                    if (draftMode) {
                                        repository.sudokuDraft(sel.first, sel.second, value)
                                    } else {
                                        repository.sudokuCommit(sel.first, sel.second, value)
                                    }
                                if (!ack.ok) error = ack.error
                            }
                        },
                        modifier = Modifier.weight(1f),
                        fillMaxWidth = false,
                        size = PartyButtonSize.Sm,
                        enabled = selected != null,
                    ) {
                        Text(alphabet[value - 1], fontSize = 12.sp)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PartyButton(
                    onClick = {
                        val sel = selected ?: return@PartyButton
                        scope.launch {
                            val ack = repository.sudokuErase(sel.first, sel.second)
                            if (!ack.ok) error = ack.error
                        }
                    },
                    enabled = selected != null,
                    variant = PartyButtonVariant.Outline,
                    fillMaxWidth = false,
                ) { Text("Erase") }
                PartyButton(
                    onClick = {
                        scope.launch {
                            val sel = selected
                            val ack =
                                if (sel != null) {
                                    repository.sudokuHint(sel.first, sel.second)
                                } else {
                                    repository.sudokuHint()
                                }
                            if (!ack.ok) error = ack.error
                        }
                    },
                    variant = PartyButtonVariant.Sun,
                    fillMaxWidth = false,
                ) { Text("Hint") }
            }
        }
    }
}
