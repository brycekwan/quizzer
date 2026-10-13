package com.party.android.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.party.android.data.PartyRepository
import com.party.android.ui.components.ErrorText
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

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Party", style = MaterialTheme.typography.displaySmall)
        Text(
            "Connect to a party server",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Server URL") },
            placeholder = { Text("http://10.0.2.2:8080") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Display name") },
            placeholder = { Text("1–24 characters") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
        )
        ErrorText(error)
        if (loading) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = { submit() },
                modifier = Modifier.fillMaxWidth(),
                enabled = serverUrl.isNotBlank() && name.isNotBlank(),
            ) {
                Text("Join")
            }
        }
    }
}
