package com.party.android.ui.wordsearch

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.font.FontWeight
import com.party.android.ui.components.PartyButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.party.android.ui.components.PartyButtonSize
import com.party.android.ui.components.PartyButtonVariant
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
fun WordSearchScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val state by repository.wordSearch.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    val selection = remember { mutableStateListOf<Pair<Int, Int>>() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val ack = repository.subscribeWordSearch()
        if (!ack.ok) error = ack.error
        repository.resumeWordSearch()
    }
    DisposableEffect(Unit) {
        onDispose { scope.launch { repository.pauseWordSearch() } }
    }

    PartyScaffold(title = "Word search", onBack = onBack) { padding ->
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
                if (snap != null) formatDuration(liveElapsedMs(snap.elapsedMs, snap.activeSince)) else "0:00",
            )
            ErrorText(error)
            if (snap?.puzzle == null) {
                EmptyState("Loading puzzle…")
                return@Column
            }
            Text(snap.puzzle.title, style = MaterialTheme.typography.titleMedium)
            Text("Found ${snap.found.size}/${snap.totalWords}")
            if (snap.completed) Text("Completed!", color = MaterialTheme.colorScheme.primary)

            val foundCells =
                snap.found.flatMap { it.cells.map { c -> c.row to c.col } }.toSet()

            Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                Column {
                    snap.puzzle.grid.forEachIndexed { row, cols ->
                        Row {
                            cols.forEachIndexed { col, letter ->
                                val key = row to col
                                val selected = selection.contains(key)
                                val found = foundCells.contains(key)
                                Box(
                                    modifier =
                                        Modifier
                                            .size(28.dp)
                                            .border(1.dp, MaterialTheme.colorScheme.outline)
                                            .background(
                                                when {
                                                    selected -> MaterialTheme.colorScheme.primaryContainer
                                                    found -> MaterialTheme.colorScheme.tertiaryContainer
                                                    else -> MaterialTheme.colorScheme.surface
                                                },
                                            )
                                            .clickable {
                                                if (selection.contains(key)) {
                                                    selection.remove(key)
                                                } else {
                                                    selection.add(key)
                                                }
                                            },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(letter, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PartyButton(
                    onClick = {
                        scope.launch {
                            val ack = repository.submitWordSearch(selection.toList())
                            if (!ack.ok) {
                                error = ack.error
                            } else if (ack.matched != true) {
                                error = "Not a word"
                            } else {
                                error = null
                                selection.clear()
                            }
                        }
                    },
                    enabled = selection.isNotEmpty(),
                    fillMaxWidth = false,
                ) { Text("Submit (${selection.size})") }
                PartyButton(
                    onClick = { selection.clear() },
                    variant = PartyButtonVariant.Outline,
                    size = PartyButtonSize.Default,
                    fillMaxWidth = false,
                ) { Text("Clear") }
            }

            Text("Words", style = MaterialTheme.typography.titleSmall)
            val foundWords = snap.found.map { it.word.uppercase() }.toSet()
            snap.puzzle.words.forEach { word ->
                val found = foundWords.contains(word.uppercase())
                Text(if (found) "✓ $word" else word)
            }
        }
    }
}
