package com.party.android.di

import android.content.Context
import com.party.android.data.PartyRepository
import com.party.android.data.PartySocket
import com.party.android.data.SessionStore

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val sessionStore = SessionStore(appContext)
    val partySocket = PartySocket()
    val repository = PartyRepository(partySocket, sessionStore)
}
