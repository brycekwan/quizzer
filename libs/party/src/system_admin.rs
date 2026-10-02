use crate::crossword_engine::CrosswordEngine;
use crate::leaderboard::{
    clock_has_started, display_clock, live_clock_ms, rank_game_rows, rank_overall, LeaderboardRow,
    OverallCandidate, PartyLeaderboardSnapshot, PlayClock,
};
use crate::maze_engine::MazeEngine;
use crate::quizzer::GameEngine;
use crate::session::SessionRegistry;
use crate::sudoku_engine::SudokuEngine;
use crate::system::{
    build_system_leaderboard, PartyTheme, SystemAdminSnapshot, SystemScoreInput,
};
use crate::word_search_engine::WordSearchEngine;
use crate::word_survivor_engine::WordSurvivorEngine;

pub struct SystemAdmin {
    pub sessions: SessionRegistry,
    pub quiz: GameEngine,
    pub crossword: CrosswordEngine,
    pub word_search: WordSearchEngine,
    pub sudoku: SudokuEngine,
    pub maze: MazeEngine,
    pub word_survivor: WordSurvivorEngine,
    pub theme: PartyTheme,
}

impl SystemAdmin {
    pub fn new(
        sessions: SessionRegistry,
        quiz: GameEngine,
        crossword: CrosswordEngine,
        word_search: WordSearchEngine,
        sudoku: SudokuEngine,
        maze: MazeEngine,
        word_survivor: WordSurvivorEngine,
    ) -> Self {
        Self {
            sessions,
            quiz,
            crossword,
            word_search,
            sudoku,
            maze,
            word_survivor,
            theme: PartyTheme::Standard,
        }
    }

    pub fn set_theme(&mut self, theme: &str) -> Result<PartyTheme, String> {
        let theme = PartyTheme::parse(theme)?;
        self.theme = theme;
        Ok(theme)
    }

    pub fn snapshot(&self) -> SystemAdminSnapshot {
        let crossword_scores: Vec<(String, i64)> = self
            .crossword
            .admin_snapshot()
            .players
            .into_iter()
            .map(|player| (player.player_id, player.score))
            .collect();
        let word_search_scores: Vec<(String, i64)> = self
            .word_search
            .admin_snapshot()
            .players
            .into_iter()
            .map(|player| (player.player_id, player.score))
            .collect();

        let sudoku_scores: Vec<(String, i64)> = self
            .sudoku
            .admin_snapshot()
            .players
            .into_iter()
            .map(|player| (player.player_id, player.score))
            .collect();
        let maze_scores: Vec<(String, i64)> = self
            .maze
            .admin_snapshot()
            .players
            .into_iter()
            .map(|player| (player.player_id, player.score))
            .collect();
        let word_survivor_scores: Vec<(String, i64)> = self
            .word_survivor
            .admin_snapshot()
            .players
            .into_iter()
            .map(|player| (player.player_id, player.score))
            .collect();

        let inputs = self
            .sessions
            .list()
            .into_iter()
            .map(|session| {
                let quiz_player = self.quiz.get_player(&session.id);
                SystemScoreInput {
                    player_id: session.id.clone(),
                    name: session.name,
                    connected: session.connected,
                    crossword_score: crossword_scores
                        .iter()
                        .find(|(id, _)| id == &session.id)
                        .map(|(_, score)| *score),
                    word_search_score: word_search_scores
                        .iter()
                        .find(|(id, _)| id == &session.id)
                        .map(|(_, score)| *score),
                    sudoku_score: sudoku_scores
                        .iter()
                        .find(|(id, _)| id == &session.id)
                        .map(|(_, score)| *score),
                    maze_score: maze_scores
                        .iter()
                        .find(|(id, _)| id == &session.id)
                        .map(|(_, score)| *score),
                    word_survivor_score: word_survivor_scores
                        .iter()
                        .find(|(id, _)| id == &session.id)
                        .map(|(_, score)| *score),
                    quiz_score: quiz_player.map(|player| player.score),
                }
            })
            .collect::<Vec<_>>();
        let mut snapshot = build_system_leaderboard(&inputs);
        snapshot.theme = self.theme;
        snapshot
    }

    pub fn leaderboard(&self) -> PartyLeaderboardSnapshot {
        let crossword = self.crossword.admin_snapshot();
        let crossword_now = self.crossword.clock().now();
        let word_search = self.word_search.admin_snapshot();
        let word_search_now = self.word_search.clock().now();
        let sudoku = self.sudoku.admin_snapshot();
        let sudoku_now = self.sudoku.clock().now();
        let maze = self.maze.admin_snapshot();
        let maze_now = self.maze.clock().now();
        let word_survivor = self.word_survivor.admin_snapshot();
        let word_survivor_now = self.word_survivor.clock().now();

        let crossword_rows = rank_game_rows(
            crossword
                .players
                .iter()
                .map(|player| {
                    (
                        player.player_id.clone(),
                        player.name.clone(),
                        player.score,
                        display_clock(
                            player.elapsed_ms,
                            player.active_since,
                            player.completed_at,
                            crossword_now,
                            false,
                        ),
                    )
                })
                .collect(),
        );
        let word_search_rows = rank_game_rows(
            word_search
                .players
                .iter()
                .map(|player| {
                    (
                        player.player_id.clone(),
                        player.name.clone(),
                        player.score,
                        display_clock(
                            player.elapsed_ms,
                            player.active_since,
                            player.completed_at,
                            word_search_now,
                            false,
                        ),
                    )
                })
                .collect(),
        );
        let sudoku_rows = rank_game_rows(
            sudoku
                .players
                .iter()
                .map(|player| {
                    (
                        player.player_id.clone(),
                        player.name.clone(),
                        player.score,
                        display_clock(
                            player.elapsed_ms,
                            player.active_since,
                            player.completed_at,
                            sudoku_now,
                            false,
                        ),
                    )
                })
                .collect(),
        );
        let maze_rows = rank_game_rows(
            maze.players
                .iter()
                .map(|player| {
                    (
                        player.player_id.clone(),
                        player.name.clone(),
                        player.score,
                        display_clock(
                            player.elapsed_ms,
                            player.active_since,
                            player.completed_at,
                            maze_now,
                            true,
                        ),
                    )
                })
                .collect(),
        );
        let word_survivor_rows = rank_game_rows(
            word_survivor
                .players
                .iter()
                .map(|player| {
                    (
                        player.player_id.clone(),
                        player.name.clone(),
                        player.score,
                        display_clock(
                            player.elapsed_ms,
                            player.active_since,
                            player.completed_at,
                            word_survivor_now,
                            true,
                        ),
                    )
                })
                .collect(),
        );
        let quiz_rows = self
            .quiz
            .leaderboard()
            .into_iter()
            .map(|entry| LeaderboardRow {
                rank: entry.rank,
                player_id: entry.id,
                name: entry.name,
                score: entry.score,
                quiz_score: None,
                clocks: vec![],
            })
            .collect();

        let mut candidates = Vec::new();
        for session in self.sessions.list() {
            if !session.connected {
                continue;
            }
            let mut score = 0i64;
            let mut clocks: Vec<PlayClock> = Vec::new();
            let mut play_ms = 0i64;
            let mut started = false;
            for (rows, now) in [
                (&crossword_rows, crossword_now),
                (&word_search_rows, word_search_now),
                (&sudoku_rows, sudoku_now),
                (&maze_rows, maze_now),
                (&word_survivor_rows, word_survivor_now),
            ] {
                let Some(row) = rows.iter().find(|row| row.player_id == session.id) else {
                    continue;
                };
                score = score.saturating_add(row.score);
                for clock in &row.clocks {
                    if !clock_has_started(clock.elapsed_ms, clock.active_since, None) {
                        continue;
                    }
                    started = true;
                    play_ms = play_ms.saturating_add(live_clock_ms(clock, now));
                    clocks.push(clock.clone());
                }
            }
            let quiz_score = self
                .quiz
                .get_player(&session.id)
                .map(|player| player.score);
            candidates.push(OverallCandidate {
                player_id: session.id,
                name: session.name,
                score,
                quiz_score,
                clocks,
                play_ms: if started { play_ms } else { i64::MAX },
            });
        }

        PartyLeaderboardSnapshot {
            overall: rank_overall(candidates),
            crossword: crossword_rows,
            word_search: word_search_rows,
            sudoku: sudoku_rows,
            maze: maze_rows,
            word_survivor: word_survivor_rows,
            quiz: quiz_rows,
        }
    }

    pub fn remove_player(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let socket_id = self.sessions.remove(player_id)?;
        let _ = self.quiz.kick(player_id);
        self.crossword.remove_player(player_id);
        self.word_search.remove_player(player_id);
        self.sudoku.remove_player(player_id);
        self.maze.remove_player(player_id);
        self.word_survivor.remove_player(player_id);
        Ok(socket_id)
    }

    /// Remove every login and wipe quiz, crossword, word search, sudoku, maze, and word survivor progress.
    pub fn reset_all(&mut self) -> Vec<String> {
        let mut socket_ids: Vec<String> = self
            .sessions
            .list()
            .into_iter()
            .filter_map(|session| session.socket_id)
            .collect();
        for socket_id in self.quiz.reset() {
            if !socket_ids.iter().any(|current| current == &socket_id) {
                socket_ids.push(socket_id);
            }
        }
        self.sessions.clear();
        self.crossword.clear_players();
        self.word_search.clear_players();
        self.sudoku.clear_players();
        self.maze.clear_players();
        self.word_survivor.clear_players();
        socket_ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crossword::{derive_crossword_words, CrosswordClueDef, CrosswordPuzzleFile};
    use crate::maze::step_maze;
    use crate::maze::MazeDifficulty;
    use crate::sudoku::classic_sudoku_file;
    use crate::types::{AnswerOption, Question};
    use crate::word_search::{
        WordSearchCellRef, WordSearchDirection, WordSearchFile, WordSearchPlacement, WordSearchWord,
    };
    use crate::word_survivor::sample_word_lists;

    fn crossword() -> (CrosswordPuzzleFile, Vec<crate::crossword::CrosswordWord>) {
        let puzzle = CrosswordPuzzleFile {
            id: "mini".into(),
            title: "Mini".into(),
            grid: vec![
                vec![Some("P".into()), Some("I".into()), Some("E".into())],
                vec![Some("A".into()), None, None],
                vec![Some("N".into()), None, None],
            ],
            across: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "Dessert".into(),
            }],
            down: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "Cooking vessel".into(),
            }],
        };
        let words = derive_crossword_words(&puzzle).unwrap();
        (puzzle, words)
    }

    fn cat() -> WordSearchWord {
        WordSearchWord {
            id: "CAT".into(),
            word: "CAT".into(),
            row: 0,
            col: 0,
            direction: WordSearchDirection::E,
            cells: vec![
                WordSearchCellRef { row: 0, col: 0 },
                WordSearchCellRef { row: 0, col: 1 },
                WordSearchCellRef { row: 0, col: 2 },
            ],
        }
    }

    fn admin() -> SystemAdmin {
        let (puzzle, words) = crossword();
        let search = WordSearchFile {
            id: "mini".into(),
            title: "Mini".into(),
            grid: vec![
                vec!["C".into(), "A".into(), "T".into()],
                vec!["X".into(), "X".into(), "X".into()],
                vec!["X".into(), "X".into(), "X".into()],
            ],
            words: vec![WordSearchPlacement {
                word: "CAT".into(),
                row: 0,
                col: 0,
                direction: WordSearchDirection::E,
            }],
        };
        let quiz = GameEngine::new(vec![Question {
            id: "q1".into(),
            question: "Q?".into(),
            answers: vec![
                AnswerOption {
                    id: "a".into(),
                    text: "A".into(),
                    correct: true,
                },
                AnswerOption {
                    id: "b".into(),
                    text: "B".into(),
                    correct: false,
                },
            ],
            score: None,
            multiplier: None,
        }]);
        SystemAdmin::new(
            SessionRegistry::new(),
            quiz,
            CrosswordEngine::new(puzzle, words),
            WordSearchEngine::new(search, vec![cat()]),
            SudokuEngine::new(classic_sudoku_file()).unwrap(),
            MazeEngine::new(
                step_maze(MazeDifficulty::Easy, "nursery", "Nursery door"),
                step_maze(MazeDifficulty::Medium, "kitchen", "The refrigerator"),
                step_maze(MazeDifficulty::Hard, "bottle", "Milk bottle"),
            )
            .unwrap(),
            WordSurvivorEngine::new(sample_word_lists()),
        )
    }

    #[test]
    fn ranks_connected_players_and_keeps_quiz_separate() {
        let mut admin = admin();
        let ada = admin.sessions.login("Ada", "s-ada", None).unwrap();
        let bea = admin.sessions.login("Bea", "s-bea", None).unwrap();
        admin.sessions.login("Cal", "s-cal", None).unwrap();
        admin.sessions.mark_disconnected("s-cal");
        admin.crossword.ensure_player(&ada.session.id, "Ada");
        for (row, col, letter) in [
            (0, 0, "P"),
            (0, 1, "I"),
            (0, 2, "E"),
            (1, 0, "A"),
            (2, 0, "N"),
        ] {
            admin
                .crossword
                .set_letter(&ada.session.id, row, col, letter)
                .unwrap();
        }
        admin.word_search.ensure_player(&bea.session.id, "Bea");
        admin
            .word_search
            .submit_selection(&bea.session.id, &cat().cells)
            .unwrap();
        admin
            .quiz
            .join("Ada", "s-ada", Some(&ada.session.id))
            .unwrap();
        admin.quiz.start(0.0).unwrap();
        admin.quiz.submit_answer(&ada.session.id, "a").unwrap();
        let board = admin.snapshot();
        let names: Vec<_> = board
            .players
            .iter()
            .map(|player| player.name.as_str())
            .collect();
        assert_eq!(names, ["Ada", "Bea"]);
        assert_eq!(board.players[0].accumulated_score, 200);
        assert_eq!(board.players[0].crossword_score, Some(200));
        assert!(board.players[0].word_search_score.is_none());
        assert!(board.players[0].quiz_score.unwrap_or(0) > 0);
        assert_eq!(board.players[1].accumulated_score, 100);
        assert_eq!(board.players[1].word_search_score, Some(100));
        assert!(board.players[1].quiz_score.is_none());
        let party = admin.leaderboard();
        assert_eq!(party.overall[0].name, "Ada");
        assert_eq!(party.overall[0].score, 200);
        assert!(party.overall[0].quiz_score.unwrap_or(0) > 0);
        assert_eq!(party.overall[1].score, 100);
        assert_eq!(party.crossword[0].score, 200);
        assert_eq!(party.word_search[0].score, 100);
        assert!(party.quiz.iter().any(|row| row.score > 0));
        assert!(party.quiz[0].clocks.is_empty());
    }

    #[test]
    fn removes_player_from_every_game() {
        let mut admin = admin();
        let ada = admin.sessions.login("Ada", "s-ada", None).unwrap();
        let bea = admin.sessions.login("Bea", "s-bea", None).unwrap();
        admin.crossword.ensure_player(&ada.session.id, "Ada");
        admin
            .crossword
            .set_letter(&ada.session.id, 0, 0, "P")
            .unwrap();
        admin.word_search.ensure_player(&ada.session.id, "Ada");
        admin
            .word_search
            .submit_selection(&ada.session.id, &cat().cells)
            .unwrap();
        admin
            .quiz
            .join("Ada", "s-ada", Some(&ada.session.id))
            .unwrap();
        admin.word_search.ensure_player(&bea.session.id, "Bea");
        assert_eq!(
            admin.remove_player(&ada.session.id).unwrap().as_deref(),
            Some("s-ada")
        );
        assert!(admin.sessions.get(&ada.session.id).is_none());
        assert!(admin.quiz.get_player(&ada.session.id).is_none());
        assert!(admin.crossword.player_snapshot(&ada.session.id).is_none());
        assert!(admin.word_search.player_snapshot(&ada.session.id).is_none());
        assert!(admin.sudoku.player_snapshot(&ada.session.id).is_none());
        assert!(admin.maze.player_snapshot(&ada.session.id).is_none());
        assert!(admin
            .word_survivor
            .player_snapshot(&ada.session.id)
            .is_none());
        assert_eq!(admin.snapshot().players[0].player_id, bea.session.id);
        assert_eq!(admin.word_search.admin_snapshot().players[0].name, "Bea");
    }

    #[test]
    fn reset_all_clears_players_and_scores() {
        let mut admin = admin();
        let ada = admin.sessions.login("Ada", "s-ada", None).unwrap();
        admin.crossword.ensure_player(&ada.session.id, "Ada");
        admin
            .crossword
            .set_letter(&ada.session.id, 0, 0, "P")
            .unwrap();
        admin.word_search.ensure_player(&ada.session.id, "Ada");
        admin
            .word_search
            .submit_selection(&ada.session.id, &cat().cells)
            .unwrap();
        admin
            .quiz
            .join("Ada", "s-quiz", Some(&ada.session.id))
            .unwrap();
        admin.sudoku.ensure_player(&ada.session.id, "Ada");
        admin.sudoku.commit(&ada.session.id, 0, 2, 1).unwrap();
        let sockets = admin.reset_all();
        assert!(sockets.contains(&"s-ada".to_string()));
        assert!(sockets.contains(&"s-quiz".to_string()));
        assert!(admin.sessions.list().is_empty());
        assert!(admin.quiz.get_player(&ada.session.id).is_none());
        assert!(admin.crossword.admin_snapshot().players.is_empty());
        assert!(admin.word_search.admin_snapshot().players.is_empty());
        assert!(admin.sudoku.admin_snapshot().players.is_empty());
        assert!(admin.maze.admin_snapshot().players.is_empty());
        assert!(admin.word_survivor.admin_snapshot().players.is_empty());
        assert!(admin.snapshot().players.is_empty());
    }

    #[test]
    fn remembers_the_selected_theme() {
        let mut admin = admin();
        assert_eq!(admin.snapshot().theme, PartyTheme::Standard);
        admin.set_theme("baby").unwrap();
        assert_eq!(admin.snapshot().theme, PartyTheme::Baby);
        assert!(admin.set_theme("neon").is_err());
        assert_eq!(admin.theme, PartyTheme::Baby);
    }

    #[test]
    fn rejects_missing_player() {
        let mut admin = admin();
        assert_eq!(
            admin.remove_player("missing").unwrap_err(),
            "Player not found"
        );
    }
}
