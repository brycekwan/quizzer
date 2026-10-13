package com.party.android

import android.app.Application
import com.party.android.di.AppContainer

class PartyApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
