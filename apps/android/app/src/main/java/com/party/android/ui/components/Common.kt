package com.party.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.party.android.ui.theme.PartyColors

@Composable
fun PartyPlayfield(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val isDark = isSystemInDarkTheme()
    val brush =
        if (isDark) {
            Brush.linearGradient(
                colors = listOf(Color(0xFF07060D), Color(0xFF140E22), Color(0xFF0B1018)),
                start = Offset.Zero,
                end = Offset(1200f, 1800f),
            )
        } else {
            Brush.linearGradient(
                colors = listOf(PartyColors.Cream, PartyColors.PlayfieldPink, PartyColors.PlayfieldBlue),
                start = Offset.Zero,
                end = Offset(1000f, 1600f),
            )
        }
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(brush)
                .background(
                    Brush.radialGradient(
                        colors = listOf(if (isDark) Color(0x597B2CBF) else PartyColors.RadialSky, Color.Transparent),
                        center = Offset(120f, 180f),
                        radius = 420f,
                    ),
                )
                .background(
                    Brush.radialGradient(
                        colors = listOf(if (isDark) Color(0x294CC9F0) else PartyColors.RadialCoral, Color.Transparent),
                        center = Offset(900f, 100f),
                        radius = 380f,
                    ),
                )
                .background(
                    Brush.radialGradient(
                        colors = listOf(if (isDark) Color(0x24FF6B6B) else PartyColors.RadialMint, Color.Transparent),
                        center = Offset(700f, 1400f),
                        radius = 420f,
                    ),
                ),
    ) {
        content()
    }
}

@Composable
fun PartyShell(
    modifier: Modifier = Modifier,
    centered: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(32.dp)
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(shape)
                .background(PartyColors.White.copy(alpha = 0.7f))
                .border(4.dp, PartyColors.White.copy(alpha = 0.5f), shape)
                .padding(24.dp),
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
        content = content,
    )
}

/**
 * Screen chrome matching the web lobby / play layout: playfield background,
 * grape eyebrow + title, optional Lobby button — no Material top app bar.
 */
@Composable
fun PartyScaffold(
    title: String,
    onBack: (() -> Unit)? = null,
    eyebrow: String = "Party",
    shell: Boolean = false,
    centered: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (modifier: Modifier) -> Unit,
) {
    PartyPlayfield {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = eyebrow.uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = PartyColors.Grape,
                    )
                    Text(
                        text = title,
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    actions()
                    if (onBack != null) {
                        PartyButton(
                            onClick = onBack,
                            variant = PartyButtonVariant.Outline,
                            size = PartyButtonSize.Xs,
                            fillMaxWidth = false,
                        ) {
                            Text("Lobby", fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            if (shell) {
                PartyShell(
                    modifier =
                        Modifier
                            .weight(1f, fill = false)
                            .verticalScroll(rememberScrollState()),
                    centered = centered,
                ) {
                    content(Modifier)
                }
            } else {
                content(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
fun StatusLine(
    connected: Boolean,
    extra: String? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            if (connected) "Connected" else "Reconnecting…",
            style = MaterialTheme.typography.labelMedium,
            color = if (connected) PartyColors.Mint else PartyColors.Coral,
        )
        if (extra != null) {
            Text(
                extra,
                style = MaterialTheme.typography.labelMedium,
                color = PartyColors.Ink.copy(alpha = 0.6f),
            )
        }
    }
}

@Composable
fun ErrorText(message: String?) {
    if (!message.isNullOrBlank()) {
        Text(
            message,
            color = PartyColors.Coral,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier.padding(vertical = 4.dp),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun EmptyState(message: String) {
    Column(modifier = Modifier.padding(24.dp)) {
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            color = PartyColors.Ink.copy(alpha = 0.6f),
        )
    }
}

@Composable
fun BrandEyebrow(text: String = "Party") {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = PartyColors.Grape,
    )
}
