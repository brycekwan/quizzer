use serde::{Deserialize, Serialize};

/// One game's play clock. `elapsed_ms` is time already banked. `active_since`
/// is the wall-clock start of the running segment, when the clock is going.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayClock {
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardRow {
    pub rank: i64,
    pub player_id: String,
    pub name: String,
    pub score: i64,
    /// Quiz points on the overall board. Left empty on a single-game board.
    pub quiz_score: Option<i64>,
    pub clocks: Vec<PlayClock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyLeaderboardSnapshot {
    pub overall: Vec<LeaderboardRow>,
    pub crossword: Vec<LeaderboardRow>,
    pub word_search: Vec<LeaderboardRow>,
    pub sudoku: Vec<LeaderboardRow>,
    pub maze: Vec<LeaderboardRow>,
    pub word_survivor: Vec<LeaderboardRow>,
    pub quiz: Vec<LeaderboardRow>,
}

#[derive(Debug, Clone)]
pub struct OverallCandidate {
    pub player_id: String,
    pub name: String,
    pub score: i64,
    pub quiz_score: Option<i64>,
    pub clocks: Vec<PlayClock>,
    /// Live play time used for tie-breaks. `i64::MAX` when the player has not started a clock.
    pub play_ms: i64,
}

pub fn display_clock(
    elapsed_ms: i64,
    active_since: Option<i64>,
    completed_at: Option<i64>,
    now: i64,
    elapsed_includes_running: bool,
) -> PlayClock {
    if completed_at.is_some() || active_since.is_none() {
        return PlayClock {
            elapsed_ms,
            active_since: None,
        };
    }
    let started = active_since.expect("active");
    if elapsed_includes_running {
        let raw = (elapsed_ms - (now - started).max(0)).max(0);
        return PlayClock {
            elapsed_ms: raw,
            active_since: Some(started),
        };
    }
    PlayClock {
        elapsed_ms,
        active_since: Some(started),
    }
}

pub fn clock_has_started(
    elapsed_ms: i64,
    active_since: Option<i64>,
    completed_at: Option<i64>,
) -> bool {
    !(completed_at.is_none() && active_since.is_none() && elapsed_ms == 0)
}

pub fn live_clock_ms(clock: &PlayClock, now: i64) -> i64 {
    match clock.active_since {
        Some(started) => clock.elapsed_ms.saturating_add((now - started).max(0)),
        None => clock.elapsed_ms,
    }
}

/// Higher score first. Equal scores use shorter total play time, then name.
pub fn rank_overall(mut candidates: Vec<OverallCandidate>) -> Vec<LeaderboardRow> {
    candidates.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.play_ms.cmp(&right.play_ms))
            .then_with(|| left.name.cmp(&right.name))
    });
    candidates
        .into_iter()
        .enumerate()
        .map(|(index, candidate)| LeaderboardRow {
            rank: (index + 1) as i64,
            player_id: candidate.player_id,
            name: candidate.name,
            score: candidate.score,
            quiz_score: candidate.quiz_score,
            clocks: candidate.clocks,
        })
        .collect()
}

pub fn rank_game_rows(
    rows: Vec<(String, String, i64, PlayClock)>,
) -> Vec<LeaderboardRow> {
    rows.into_iter()
        .enumerate()
        .map(|(index, (player_id, name, score, clock))| LeaderboardRow {
            rank: (index + 1) as i64,
            player_id,
            name,
            score,
            quiz_score: None,
            clocks: vec![clock],
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(
        name: &str,
        score: i64,
        play_ms: i64,
        quiz: Option<i64>,
    ) -> OverallCandidate {
        OverallCandidate {
            player_id: name.to_string(),
            name: name.to_string(),
            score,
            quiz_score: quiz,
            clocks: vec![],
            play_ms,
        }
    }

    #[test]
    fn ranks_by_score_then_shorter_total_time() {
        let rows = rank_overall(vec![
            candidate("Bea", 200, 60_000, None),
            candidate("Ada", 200, 30_000, Some(500)),
            candidate("Cal", 100, 1_000, None),
            candidate("Dee", 200, i64::MAX, None),
        ]);
        let names: Vec<_> = rows.iter().map(|row| row.name.as_str()).collect();
        assert_eq!(names, ["Ada", "Bea", "Dee", "Cal"]);
        assert_eq!(rows[0].quiz_score, Some(500));
        assert_eq!(rows[0].score, 200);
    }

    #[test]
    fn unfolds_a_running_clock_that_already_includes_the_current_segment() {
        let clock = display_clock(15_000, Some(10_000), None, 20_000, true);
        assert_eq!(clock.elapsed_ms, 5_000);
        assert_eq!(clock.active_since, Some(10_000));
        assert_eq!(live_clock_ms(&clock, 20_000), 15_000);
    }
}
