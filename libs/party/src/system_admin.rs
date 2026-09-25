use crate::crossword_engine::CrosswordEngine;
use crate::quizzer::GameEngine;
use crate::session::SessionRegistry;
use crate::system::{build_system_leaderboard, SystemAdminSnapshot, SystemScoreInput};
use crate::word_search_engine::WordSearchEngine;

pub struct SystemAdmin {
    pub sessions: SessionRegistry,
    pub quiz: GameEngine,
    pub crossword: CrosswordEngine,
    pub word_search: WordSearchEngine,
}

impl SystemAdmin {
    pub fn new(
        sessions: SessionRegistry,
        quiz: GameEngine,
        crossword: CrosswordEngine,
        word_search: WordSearchEngine,
    ) -> Self {
        Self {
            sessions,
            quiz,
            crossword,
            word_search,
        }
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
                    quiz_score: quiz_player.map(|player| player.score),
                }
            })
            .collect::<Vec<_>>();
        build_system_leaderboard(&inputs)
    }

    pub fn remove_player(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let socket_id = self.sessions.remove(player_id)?;
        let _ = self.quiz.kick(player_id);
        self.crossword.remove_player(player_id);
        self.word_search.remove_player(player_id);
        Ok(socket_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crossword::{derive_crossword_words, CrosswordClueDef, CrosswordPuzzleFile};
    use crate::types::{AnswerOption, Question};
    use crate::word_search::{WordSearchCellRef, WordSearchDirection, WordSearchFile, WordSearchPlacement, WordSearchWord};

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
        for (row, col, letter) in [(0, 0, "P"), (0, 1, "I"), (0, 2, "E"), (1, 0, "A"), (2, 0, "N")] {
            admin.crossword.set_letter(&ada.session.id, row, col, letter).unwrap();
        }
        admin.word_search.ensure_player(&bea.session.id, "Bea");
        admin
            .word_search
            .submit_selection(&bea.session.id, &cat().cells)
            .unwrap();
        admin.quiz.join("Ada", "s-ada", Some(&ada.session.id)).unwrap();
        admin.quiz.start(0.0).unwrap();
        admin.quiz.submit_answer(&ada.session.id, "a").unwrap();
        let board = admin.snapshot();
        let names: Vec<_> = board.players.iter().map(|player| player.name.as_str()).collect();
        assert_eq!(names, ["Ada", "Bea"]);
        assert_eq!(board.players[0].accumulated_score, 1200);
        assert_eq!(board.players[0].crossword_score, Some(1200));
        assert!(board.players[0].word_search_score.is_none());
        assert!(board.players[0].quiz_score.unwrap_or(0) > 0);
        assert_eq!(board.players[1].accumulated_score, 1100);
        assert_eq!(board.players[1].word_search_score, Some(1100));
        assert!(board.players[1].quiz_score.is_none());
    }

    #[test]
    fn removes_player_from_every_game() {
        let mut admin = admin();
        let ada = admin.sessions.login("Ada", "s-ada", None).unwrap();
        let bea = admin.sessions.login("Bea", "s-bea", None).unwrap();
        admin.crossword.ensure_player(&ada.session.id, "Ada");
        admin.crossword.set_letter(&ada.session.id, 0, 0, "P").unwrap();
        admin.word_search.ensure_player(&ada.session.id, "Ada");
        admin
            .word_search
            .submit_selection(&ada.session.id, &cat().cells)
            .unwrap();
        admin.quiz.join("Ada", "s-ada", Some(&ada.session.id)).unwrap();
        admin.word_search.ensure_player(&bea.session.id, "Bea");
        assert_eq!(admin.remove_player(&ada.session.id).unwrap().as_deref(), Some("s-ada"));
        assert!(admin.sessions.get(&ada.session.id).is_none());
        assert!(admin.quiz.get_player(&ada.session.id).is_none());
        assert!(admin.crossword.player_snapshot(&ada.session.id).is_none());
        assert!(admin.word_search.player_snapshot(&ada.session.id).is_none());
        assert_eq!(admin.snapshot().players[0].player_id, bea.session.id);
        assert_eq!(admin.word_search.admin_snapshot().players[0].name, "Bea");
    }

    #[test]
    fn rejects_missing_player() {
        let mut admin = admin();
        assert_eq!(admin.remove_player("missing").unwrap_err(), "Player not found");
    }
}
