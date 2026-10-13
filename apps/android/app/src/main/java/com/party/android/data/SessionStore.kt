package com.party.android.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "party_session")

data class StoredSession(
    val serverUrl: String?,
    val playerId: String?,
    val playerName: String?,
)

class SessionStore(private val context: Context) {
    private val serverUrlKey = stringPreferencesKey("server_url")
    private val playerIdKey = stringPreferencesKey("player_id")
    private val playerNameKey = stringPreferencesKey("player_name")

    val session: Flow<StoredSession> =
        context.dataStore.data.map { prefs ->
            StoredSession(
                serverUrl = prefs[serverUrlKey],
                playerId = prefs[playerIdKey],
                playerName = prefs[playerNameKey],
            )
        }

    suspend fun saveLogin(serverUrl: String, playerId: String, playerName: String) {
        context.dataStore.edit { prefs ->
            prefs[serverUrlKey] = serverUrl
            prefs[playerIdKey] = playerId
            prefs[playerNameKey] = playerName
        }
    }

    suspend fun saveServerUrl(serverUrl: String) {
        context.dataStore.edit { prefs ->
            prefs[serverUrlKey] = serverUrl
        }
    }

    suspend fun clearPlayerId() {
        context.dataStore.edit { prefs ->
            prefs.remove(playerIdKey)
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit { prefs ->
            prefs.remove(playerIdKey)
            prefs.remove(playerNameKey)
        }
    }

    suspend fun clearAll() {
        context.dataStore.edit { prefs ->
            prefs.clear()
        }
    }
}
