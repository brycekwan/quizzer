package com.party.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.party.android.ui.navigation.PartyNavHost
import com.party.android.ui.theme.PartyTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as PartyApp
        val repository = app.container.repository

        lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                private var hiddenAt: Long? = null

                override fun onStop(owner: LifecycleOwner) {
                    hiddenAt = System.currentTimeMillis()
                }

                override fun onStart(owner: LifecycleOwner) {
                    hiddenAt = null
                    repository.refreshConnection()
                }
            },
        )

        setContent {
            PartyTheme {
                PartyNavHost(repository)
            }
        }
    }
}
