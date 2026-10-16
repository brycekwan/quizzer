package com.party.android.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.BrandEyebrow
import com.party.android.ui.components.PartyButton
import com.party.android.ui.components.PartyButtonSize
import com.party.android.ui.components.PartyButtonVariant
import com.party.android.ui.components.PartyPlayfield
import com.party.android.ui.components.PartyShell
import com.party.android.ui.components.StatusLine
import com.party.android.ui.navigation.Routes
import com.party.android.ui.theme.PartyColors
import kotlinx.coroutines.launch

@Composable
fun MenuScreen(
    repository: PartyRepository,
    onNavigate: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    PartyPlayfield {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PartyShell {
                BrandEyebrow()
                Spacer(Modifier.height(8.dp))
                Text(
                    "Game Lobby",
                    style = MaterialTheme.typography.displaySmall,
                    textAlign = TextAlign.Center,
                )
                Text(
                    buildString {
                        append("Playing as ")
                        append(session.playerName ?: "…")
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = PartyColors.Ink.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    session.serverUrl.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = PartyColors.Ink.copy(alpha = 0.45f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 4.dp),
                )
                StatusLine(connected = session.connected)
                Spacer(Modifier.height(16.dp))
                GameButton("Quizzer") { onNavigate(Routes.Quizzer) }
                Spacer(Modifier.height(12.dp))
                GameButton("Crossword", outline = true) { onNavigate(Routes.Crossword) }
                Spacer(Modifier.height(12.dp))
                GameButton("Word search", outline = true) { onNavigate(Routes.WordSearch) }
                Spacer(Modifier.height(12.dp))
                GameButton("Sudoku", outline = true) { onNavigate(Routes.Sudoku) }
                Spacer(Modifier.height(12.dp))
                GameButton("Maze", outline = true) { onNavigate(Routes.Maze) }
                Spacer(Modifier.height(12.dp))
                GameButton("Word Survivor", outline = true) { onNavigate(Routes.WordSurvivor) }
                Spacer(Modifier.height(12.dp))
                GameButton("Leaderboard", outline = true) { onNavigate(Routes.Leaderboard) }
                Spacer(Modifier.height(12.dp))
                PartyButton(
                    onClick = {
                        scope.launch {
                            repository.logout()
                            onLogout()
                        }
                    },
                    variant = PartyButtonVariant.Outline,
                    size = PartyButtonSize.Default,
                ) {
                    Text("Sign out", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun GameButton(
    label: String,
    outline: Boolean = false,
    onClick: () -> Unit,
) {
    PartyButton(
        onClick = onClick,
        variant = if (outline) PartyButtonVariant.Outline else PartyButtonVariant.Primary,
        size = PartyButtonSize.Lg,
    ) {
        Text(label, fontWeight = FontWeight.Bold)
    }
}
