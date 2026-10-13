package com.party.android.ui.leaderboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.data.models.LeaderboardRow
import com.party.android.data.models.PartyLeaderboardSnapshot
import com.party.android.ui.components.EmptyState
import com.party.android.ui.components.ErrorText
import com.party.android.ui.components.PartyScaffold
import com.party.android.ui.components.StatusLine

private const val PLAYER_LIMIT = 10

private data class BoardTab(
    val label: String,
    val rows: (PartyLeaderboardSnapshot) -> List<LeaderboardRow>,
)

@Composable
fun LeaderboardScreen(
    repository: PartyRepository,
    onBack: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val board by repository.leaderboard.collectAsStateWithLifecycle()
    var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        val ack = repository.subscribeLeaderboard()
        if (!ack.ok) error = ack.error
    }

    val tabs =
        listOf(
            BoardTab("Overall") { it.overall },
            BoardTab("Crossword") { it.crossword },
            BoardTab("Word search") { it.wordSearch },
            BoardTab("Sudoku") { it.sudoku },
            BoardTab("Maze") { it.maze },
            BoardTab("Word Survivor") { it.wordSurvivor },
            BoardTab("Quiz") { it.quiz },
        )

    PartyScaffold(title = "Leaderboard", onBack = onBack) { padding ->
        Column(
            modifier =
                padding
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
        ) {
            StatusLine(session.connected)
            ErrorText(error)
            if (board == null) {
                EmptyState("Loading leaderboard…")
                return@Column
            }
            ScrollableTabRow(selectedTabIndex = tab) {
                tabs.forEachIndexed { index, t ->
                    Tab(
                        selected = tab == index,
                        onClick = { tab = index },
                        text = { Text(t.label) },
                    )
                }
            }
            val rows = visiblePlayerRows(tabs[tab].rows(board!!), session.playerId)
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                rows.forEach { row ->
                    when (row) {
                        is VisibleRow.Gap -> Text("…", modifier = Modifier.padding(vertical = 4.dp))
                        is VisibleRow.Rank -> {
                            Row(
                                modifier =
                                    Modifier
                                        .fillMaxWidth()
                                        .then(
                                            if (row.highlight) {
                                                Modifier.background(MaterialTheme.colorScheme.primaryContainer)
                                            } else {
                                                Modifier
                                            },
                                        )
                                        .padding(8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("${row.rank}. ${row.name}")
                                Text("${row.score}")
                            }
                        }
                    }
                }
                if (rows.isEmpty()) {
                    Text("No scores yet")
                }
            }
        }
    }
}

private sealed class VisibleRow {
    data object Gap : VisibleRow()

    data class Rank(
        val highlight: Boolean,
        val rank: Int,
        val name: String,
        val score: Int,
    ) : VisibleRow()
}

private fun visiblePlayerRows(
    rows: List<LeaderboardRow>,
    viewerId: String?,
    limit: Int = PLAYER_LIMIT,
): List<VisibleRow> {
    val top =
        rows.take(limit).map {
            VisibleRow.Rank(
                highlight = viewerId != null && it.playerId == viewerId,
                rank = it.rank,
                name = it.name,
                score = it.score,
            )
        }
    if (viewerId == null || top.any { it.highlight }) {
        return top
    }
    val self = rows.find { it.playerId == viewerId } ?: return top
    return top +
        VisibleRow.Gap +
        VisibleRow.Rank(
            highlight = true,
            rank = self.rank,
            name = self.name,
            score = self.score,
        )
}
