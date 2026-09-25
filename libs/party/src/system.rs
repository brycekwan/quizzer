use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPlayerEntry {
    pub rank: i64,
    pub player_id: String,
    pub name: String,
    pub accumulated_score: i64,
    pub crossword_score: Option<i64>,
    pub word_search_score: Option<i64>,
    pub quiz_score: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAdminSnapshot {
    pub players: Vec<SystemPlayerEntry>,
}

#[derive(Debug, Clone)]
pub struct SystemScoreInput {
    pub player_id: String,
    pub name: String,
    pub connected: bool,
    pub crossword_score: Option<i64>,
    pub word_search_score: Option<i64>,
    pub quiz_score: Option<i64>,
}

fn accumulated_of(player: &SystemScoreInput) -> i64 {
    player.crossword_score.unwrap_or(0) + player.word_search_score.unwrap_or(0)
}

pub fn build_system_leaderboard(players: &[SystemScoreInput]) -> SystemAdminSnapshot {
    let mut ranked: Vec<&SystemScoreInput> = players.iter().filter(|player| player.connected).collect();
    ranked.sort_by(|a, b| {
        accumulated_of(b)
            .cmp(&accumulated_of(a))
            .then_with(|| a.name.cmp(&b.name))
    });

    SystemAdminSnapshot {
        players: ranked
            .into_iter()
            .enumerate()
            .map(|(index, player)| SystemPlayerEntry {
                rank: (index + 1) as i64,
                player_id: player.player_id.clone(),
                name: player.name.clone(),
                accumulated_score: accumulated_of(player),
                crossword_score: player.crossword_score,
                word_search_score: player.word_search_score,
                quiz_score: player.quiz_score,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(player_id: &str, name: &str) -> SystemScoreInput {
        SystemScoreInput {
            player_id: player_id.to_string(),
            name: name.to_string(),
            connected: true,
            crossword_score: None,
            word_search_score: None,
            quiz_score: None,
        }
    }

    #[test]
    fn ranks_connected_players_ignoring_quiz() {
        let board = build_system_leaderboard(&[
            SystemScoreInput {
                crossword_score: Some(100),
                quiz_score: Some(5000),
                ..player("quiz-heavy", "Quiz")
            },
            SystemScoreInput {
                word_search_score: Some(1100),
                crossword_score: Some(200),
                ..player("search", "Search")
            },
            SystemScoreInput {
                connected: false,
                crossword_score: Some(9000),
                ..player("away", "Away")
            },
            player("new", "New"),
        ]);

        let names: Vec<_> = board.players.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["Search", "Quiz", "New"]);
        let scores: Vec<_> = board.players.iter().map(|entry| entry.accumulated_score).collect();
        assert_eq!(scores, [1300, 100, 0]);
        let quiz: Vec<_> = board.players.iter().map(|entry| entry.quiz_score).collect();
        assert_eq!(quiz, [None, Some(5000), None]);
        assert_eq!(board.players[0].rank, 1);
        assert_eq!(board.players[2].rank, 3);
    }

    #[test]
    fn breaks_ties_by_name() {
        let board = build_system_leaderboard(&[
            SystemScoreInput {
                crossword_score: Some(100),
                ..player("b", "Bea")
            },
            SystemScoreInput {
                word_search_score: Some(100),
                ..player("a", "Ada")
            },
        ]);
        let names: Vec<_> = board.players.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, ["Ada", "Bea"]);
        let ranks: Vec<_> = board.players.iter().map(|entry| entry.rank).collect();
        assert_eq!(ranks, [1, 2]);
    }
}
