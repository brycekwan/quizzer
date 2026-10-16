package com.party.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors =
    lightColorScheme(
        primary = PartyColors.Grape,
        onPrimary = PartyColors.White,
        primaryContainer = PartyColors.Sun,
        onPrimaryContainer = PartyColors.Ink,
        secondary = PartyColors.Sky,
        onSecondary = PartyColors.Ink,
        tertiary = PartyColors.Mint,
        onTertiary = PartyColors.Ink,
        error = PartyColors.Coral,
        onError = PartyColors.White,
        background = PartyColors.Cream,
        onBackground = PartyColors.Ink,
        surface = PartyColors.White,
        onSurface = PartyColors.Ink,
        surfaceVariant = Color(0xFFF5EEFF),
        onSurfaceVariant = PartyColors.Ink.copy(alpha = 0.7f),
        outline = PartyColors.Ink.copy(alpha = 0.2f),
        outlineVariant = PartyColors.Ink.copy(alpha = 0.15f),
    )

/** Dark palette mirrors `html[data-theme='dark']` playfield tones. */
private val DarkColors =
    darkColorScheme(
        primary = Color(0xFFC77DFF),
        onPrimary = PartyColors.Ink,
        primaryContainer = PartyColors.Grape,
        onPrimaryContainer = PartyColors.White,
        secondary = PartyColors.Sky,
        onSecondary = PartyColors.Ink,
        tertiary = PartyColors.Mint,
        onTertiary = PartyColors.Ink,
        error = PartyColors.Coral,
        onError = PartyColors.White,
        background = Color(0xFF07060D),
        onBackground = Color(0xFFF4ECFF),
        surface = Color(0xFF241833),
        onSurface = Color(0xFFF4ECFF),
        surfaceVariant = Color(0xFF3A3158),
        onSurfaceVariant = Color(0xFFF4ECFF).copy(alpha = 0.7f),
        outline = Color(0xFFF4ECFF).copy(alpha = 0.2f),
        outlineVariant = Color(0xFFF4ECFF).copy(alpha = 0.14f),
    )

@Composable
fun PartyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = PartyTypography,
        content = content,
    )
}
