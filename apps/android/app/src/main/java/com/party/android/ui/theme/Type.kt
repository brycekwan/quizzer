package com.party.android.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.party.android.R

@OptIn(ExperimentalTextApi::class)
private fun nunito(weight: FontWeight) =
    Font(
        resId = R.font.nunito,
        weight = weight,
        variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
    )

@OptIn(ExperimentalTextApi::class)
private fun fredoka(weight: FontWeight) =
    Font(
        resId = R.font.fredoka,
        weight = weight,
        variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
    )

val NunitoFamily =
    FontFamily(
        nunito(FontWeight.Medium),
        nunito(FontWeight.SemiBold),
        nunito(FontWeight.Bold),
        nunito(FontWeight.ExtraBold),
    )

val FredokaFamily =
    FontFamily(
        fredoka(FontWeight.Medium),
        fredoka(FontWeight.SemiBold),
        fredoka(FontWeight.Bold),
    )

val PartyTypography =
    Typography(
        displayLarge =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 48.sp,
                lineHeight = 52.sp,
                color = PartyColors.Ink,
            ),
        displayMedium =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 40.sp,
                lineHeight = 44.sp,
                color = PartyColors.Ink,
            ),
        displaySmall =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 36.sp,
                lineHeight = 40.sp,
                color = PartyColors.Ink,
            ),
        headlineLarge =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                color = PartyColors.Ink,
            ),
        headlineMedium =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                lineHeight = 32.sp,
                color = PartyColors.Ink,
            ),
        headlineSmall =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                lineHeight = 28.sp,
                color = PartyColors.Ink,
            ),
        titleLarge =
            TextStyle(
                fontFamily = FredokaFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                lineHeight = 24.sp,
                color = PartyColors.Ink,
            ),
        titleMedium =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                color = PartyColors.Ink,
            ),
        titleSmall =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                color = PartyColors.Ink,
            ),
        bodyLarge =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                color = PartyColors.Ink,
            ),
        bodyMedium =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = PartyColors.Ink,
            ),
        bodySmall =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = PartyColors.Ink,
            ),
        labelLarge =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                color = PartyColors.Ink,
            ),
        labelMedium =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 1.2.sp,
                color = PartyColors.Grape,
            ),
        labelSmall =
            TextStyle(
                fontFamily = NunitoFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 10.sp,
                lineHeight = 14.sp,
                letterSpacing = 1.sp,
                color = PartyColors.Grape,
            ),
    )
