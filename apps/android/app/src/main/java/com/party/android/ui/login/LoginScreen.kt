package com.party.android.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.BrandEyebrow
import com.party.android.ui.components.ErrorText
import com.party.android.ui.components.PartyButton
import com.party.android.ui.components.PartyButtonSize
import com.party.android.ui.components.PartyPlayfield
import com.party.android.ui.components.PartyShell
import com.party.android.ui.components.PartyTextField
import com.party.android.ui.theme.PartyColors
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    repository: PartyRepository,
    onLoggedIn: () -> Unit,
) {
    val session by repository.session.collectAsStateWithLifecycle()
    var serverUrl by remember { mutableStateOf(session.serverUrl.orEmpty().ifBlank { "" }) }
    var name by remember { mutableStateOf(session.playerName.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(session.serverUrl, session.playerName) {
        if (serverUrl.isBlank() && !session.serverUrl.isNullOrBlank()) {
            serverUrl = session.serverUrl.orEmpty()
        }
        if (name.isBlank() && !session.playerName.isNullOrBlank()) {
            name = session.playerName.orEmpty()
        }
    }

    LaunchedEffect(session.playerId) {
        if (!session.playerId.isNullOrBlank() && !session.playerName.isNullOrBlank()) {
            onLoggedIn()
        }
    }

    LaunchedEffect(session.kickedReason, session.systemRemoved) {
        if (session.systemRemoved) {
            error = session.kickedReason ?: "Removed from the party"
            repository.clearKickFlags()
        } else if (!session.kickedReason.isNullOrBlank() && session.playerId.isNullOrBlank()) {
            error = session.kickedReason
            repository.clearKickFlags()
        }
    }

    fun submit() {
        scope.launch {
            loading = true
            error = null
            val result = repository.login(serverUrl, name)
            loading = false
            if (result.ok) {
                onLoggedIn()
            } else {
                error = result.error ?: "Login failed"
            }
        }
    }

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
                    "Log in",
                    style = MaterialTheme.typography.displaySmall,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "Pick a unique name to play.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = PartyColors.Ink.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Spacer(Modifier.height(24.dp))
                PartyTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = "Server URL",
                    placeholder = "http://10.0.2.2:8080",
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
                PartyTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = "Display name",
                    placeholder = "e.g. Captain Bark",
                    isError = error != null,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                )
                ErrorText(error)
                Spacer(Modifier.height(16.dp))
                if (loading) {
                    CircularProgressIndicator(color = PartyColors.Grape)
                } else {
                    PartyButton(
                        onClick = { submit() },
                        size = PartyButtonSize.Lg,
                        enabled = serverUrl.isNotBlank() && name.isNotBlank(),
                    ) {
                        Text("Continue", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
