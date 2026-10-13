package com.party.android.ui.menu

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.PartyScaffold
import com.party.android.ui.components.StatusLine
import com.party.android.ui.navigation.Routes
import kotlinx.coroutines.launch

@Composable
fun MenuScreen(
    repository: PartyRepository,
    onNavigate: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    PartyScaffold(title = "Party") { padding ->
        Column(
            modifier =
                padding
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Playing as ${session.playerName ?: "…"}",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                session.serverUrl.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            StatusLine(connected = session.connected)
            GameButton("Quizzer") { onNavigate(Routes.Quizzer) }
            GameButton("Crossword") { onNavigate(Routes.Crossword) }
            GameButton("Word search") { onNavigate(Routes.WordSearch) }
            GameButton("Sudoku") { onNavigate(Routes.Sudoku) }
            GameButton("Maze") { onNavigate(Routes.Maze) }
            GameButton("Word Survivor") { onNavigate(Routes.WordSurvivor) }
            GameButton("Leaderboard") { onNavigate(Routes.Leaderboard) }
            OutlinedButton(
                onClick = {
                    scope.launch {
                        repository.logout()
                        onLogout()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign out")
            }
        }
    }
}

@Composable
private fun GameButton(
    label: String,
    onClick: () -> Unit,
) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text(label)
    }
}
