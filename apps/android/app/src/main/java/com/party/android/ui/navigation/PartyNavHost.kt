package com.party.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.party.android.data.PartyRepository
import com.party.android.ui.crossword.CrosswordScreen
import com.party.android.ui.leaderboard.LeaderboardScreen
import com.party.android.ui.login.LoginScreen
import com.party.android.ui.maze.MazeScreen
import com.party.android.ui.menu.MenuScreen
import com.party.android.ui.quizzer.QuizzerScreen
import com.party.android.ui.sudoku.SudokuScreen
import com.party.android.ui.wordsearch.WordSearchScreen
import com.party.android.ui.wordsurvivor.WordSurvivorScreen

@Composable
fun PartyNavHost(repository: PartyRepository) {
    val navController = rememberNavController()
    val session by repository.session.collectAsStateWithLifecycle()
    val start =
        if (!session.playerId.isNullOrBlank() && !session.playerName.isNullOrBlank()) {
            Routes.Menu
        } else {
            Routes.Login
        }

    LaunchedEffect(session.playerId, session.systemRemoved) {
        if (session.playerId.isNullOrBlank()) {
            navController.navigate(Routes.Login) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = start) {
        composable(Routes.Login) {
            LoginScreen(
                repository = repository,
                onLoggedIn = {
                    navController.navigate(Routes.Menu) {
                        popUpTo(Routes.Login) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.Menu) {
            MenuScreen(
                repository = repository,
                onNavigate = { route -> navController.navigate(route) },
                onLogout = {
                    navController.navigate(Routes.Login) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.Quizzer) {
            QuizzerScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.Crossword) {
            CrosswordScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.WordSearch) {
            WordSearchScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.Sudoku) {
            SudokuScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.Maze) {
            MazeScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.WordSurvivor) {
            WordSurvivorScreen(repository) { navController.popBackStack() }
        }
        composable(Routes.Leaderboard) {
            LeaderboardScreen(repository) { navController.popBackStack() }
        }
    }
}
