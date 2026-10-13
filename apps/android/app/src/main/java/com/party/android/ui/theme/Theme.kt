package com.party.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Teal = Color(0xFF0F766E)
private val TealDark = Color(0xFF115E59)
private val Cream = Color(0xFFF0FDFA)
private val Ink = Color(0xFF134E4A)

private val LightColors =
    lightColorScheme(
        primary = Teal,
        onPrimary = Color.White,
        secondary = TealDark,
        background = Cream,
        surface = Color.White,
        onBackground = Ink,
        onSurface = Ink,
    )

private val DarkColors =
    darkColorScheme(
        primary = Color(0xFF5EEAD4),
        onPrimary = Ink,
        secondary = Color(0xFF99F6E4),
        background = Color(0xFF042F2E),
        surface = Color(0xFF134E4A),
        onBackground = Color(0xFFCCFBF1),
        onSurface = Color(0xFFCCFBF1),
    )

@Composable
fun PartyTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}
