package com.party.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.party.android.ui.theme.PartyColors

enum class PartyButtonVariant {
    Primary,
    Outline,
    Coral,
    Mint,
    Sky,
    Sun,
    Ghost,
}

enum class PartyButtonSize {
    Xs,
    Sm,
    Default,
    Lg,
}

@Composable
fun PartyButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    variant: PartyButtonVariant = PartyButtonVariant.Primary,
    size: PartyButtonSize = PartyButtonSize.Default,
    fillMaxWidth: Boolean = true,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shadowOffset = shadowOffsetFor(variant, size)
    val buttonHeight = heightFor(size)

    val container =
        when (variant) {
            PartyButtonVariant.Primary -> PartyColors.Grape
            PartyButtonVariant.Coral -> PartyColors.Coral
            PartyButtonVariant.Mint -> PartyColors.Mint
            PartyButtonVariant.Sky -> PartyColors.Sky
            PartyButtonVariant.Sun -> PartyColors.Sun
            PartyButtonVariant.Outline -> PartyColors.White.copy(alpha = 0.8f)
            PartyButtonVariant.Ghost -> Color.Transparent
        }
    val contentColor =
        when (variant) {
            PartyButtonVariant.Primary, PartyButtonVariant.Coral -> PartyColors.White
            else -> PartyColors.Ink
        }
    val border =
        when (variant) {
            PartyButtonVariant.Outline ->
                BorderStroke(
                    if (size == PartyButtonSize.Xs) 2.dp else 4.dp,
                    PartyColors.Ink.copy(alpha = 0.2f),
                )
            else -> null
        }

    val pressY = if (pressed && enabled && shadowOffset > 0.dp) 1.dp else 0.dp
    val showShadow =
        enabled && shadowOffset > 0.dp && !pressed && variant != PartyButtonVariant.Ghost

    Box(modifier = modifier.then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)) {
        if (showShadow) {
            Box(
                modifier =
                    Modifier
                        .matchParentSize()
                        .offset(y = shadowOffset)
                        .background(
                            if (shadowOffset >= 8.dp) PartyColors.PopShadow else PartyColors.PopShadowSm,
                            shape,
                        ),
            )
        }
        Button(
            onClick = onClick,
            enabled = enabled,
            shape = shape,
            border = border,
            interactionSource = interaction,
            colors =
                ButtonDefaults.buttonColors(
                    containerColor = container,
                    contentColor = contentColor,
                    disabledContainerColor = container.copy(alpha = 0.45f),
                    disabledContentColor = contentColor.copy(alpha = 0.6f),
                ),
            elevation =
                ButtonDefaults.buttonElevation(
                    defaultElevation = 0.dp,
                    pressedElevation = 0.dp,
                ),
            contentPadding = paddingFor(size),
            modifier =
                Modifier
                    .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
                    .height(buttonHeight)
                    .offset(y = pressY),
            content = content,
        )
    }
}

@Composable
fun PartyTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    isError: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val shape = RoundedCornerShape(16.dp)
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        enabled = enabled,
        singleLine = singleLine,
        isError = isError,
        label = label?.let { { Text(it, fontWeight = FontWeight.ExtraBold) } },
        placeholder =
            placeholder?.let {
                {
                    Text(
                        it,
                        color = PartyColors.Ink.copy(alpha = 0.4f),
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            },
        shape = shape,
        textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        colors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PartyColors.Sky,
                unfocusedBorderColor = PartyColors.Ink.copy(alpha = 0.15f),
                errorBorderColor = PartyColors.Coral,
                focusedContainerColor = PartyColors.White,
                unfocusedContainerColor = PartyColors.White,
                cursorColor = PartyColors.Grape,
                focusedLabelColor = PartyColors.Grape,
                unfocusedLabelColor = PartyColors.Ink.copy(alpha = 0.6f),
            ),
    )
}

private fun shadowOffsetFor(
    variant: PartyButtonVariant,
    size: PartyButtonSize,
): Dp {
    if (variant == PartyButtonVariant.Ghost || size == PartyButtonSize.Xs) return 0.dp
    return if (variant == PartyButtonVariant.Outline) 4.dp else 8.dp
}

private fun heightFor(size: PartyButtonSize): Dp =
    when (size) {
        PartyButtonSize.Xs -> 32.dp
        PartyButtonSize.Sm -> 40.dp
        PartyButtonSize.Default -> 48.dp
        PartyButtonSize.Lg -> 56.dp
    }

private fun paddingFor(size: PartyButtonSize): PaddingValues =
    when (size) {
        PartyButtonSize.Xs -> PaddingValues(horizontal = 10.dp, vertical = 0.dp)
        PartyButtonSize.Sm -> PaddingValues(horizontal = 16.dp, vertical = 0.dp)
        PartyButtonSize.Default -> PaddingValues(horizontal = 20.dp, vertical = 0.dp)
        PartyButtonSize.Lg -> PaddingValues(horizontal = 24.dp, vertical = 0.dp)
    }
