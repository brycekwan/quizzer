use crate::clock::Clock;
use crate::crossword::{
    crossword_score, empty_letter_grid, to_public_crossword_puzzle, CrosswordAdminEntry,
    CrosswordAdminSnapshot, CrosswordPlayerSnapshot, CrosswordPublicPuzzle, CrosswordPuzzleFile,
    CrosswordPuzzleInfo, CrosswordWord,
};
use indexmap::IndexMap;

struct PlayerProgress {
    player_id: String,
    name: String,
    letters: Vec<Vec<Option<String>>>,
    correct_word_ids: Vec<String>,
    elapsed_ms: i64,
    active_since: Option<i64>,
    timer_started: bool,
    completed_at: Option<i64>,
}

fn current_elapsed_ms(elapsed_ms: i64, active_since: Option<i64>, completed_at: Option<i64>, now: i64) -> i64 {
    if completed_at.is_some() {
        return elapsed_ms;
    }
    match active_since {
        None => elapsed_ms,
        Some(started) => elapsed_ms + (now - started).max(0),
    }
}

pub struct CrosswordEngine {
    puzzle: CrosswordPuzzleFile,
    words: Vec<CrosswordWord>,
    public_puzzle: CrosswordPublicPuzzle,
    pending_puzzle_id: String,
    puzzles: Vec<CrosswordPuzzleInfo>,
    players: IndexMap<String, PlayerProgress>,
    clock: Clock,
}

impl CrosswordEngine {
    pub fn new(puzzle: CrosswordPuzzleFile, words: Vec<CrosswordWord>) -> Self {
        Self::with_clock(puzzle, words, None, None, Clock::system())
    }

    pub fn with_clock(
        puzzle: CrosswordPuzzleFile,
        words: Vec<CrosswordWord>,
        puzzles: Option<Vec<CrosswordPuzzleInfo>>,
        pending_puzzle_id: Option<String>,
        clock: Clock,
    ) -> Self {
        let public_puzzle = to_public_crossword_puzzle(&puzzle, &words);
        let puzzles = puzzles.unwrap_or_else(|| {
            vec![CrosswordPuzzleInfo {
                id: puzzle.id.clone(),
                label: format!("{}.json", puzzle.id),
            }]
        });
        let pending_puzzle_id = pending_puzzle_id.unwrap_or_else(|| puzzle.id.clone());
        Self {
            puzzle,
            words,
            public_puzzle,
            pending_puzzle_id,
            puzzles,
            players: IndexMap::new(),
            clock,
        }
    }

    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    fn now(&self) -> i64 {
        self.clock.now()
    }

    pub fn total_words(&self) -> usize {
        self.words.len()
    }

    pub fn active_puzzle_id(&self) -> &str {
        &self.puzzle.id
    }

    pub fn pending_puzzle_id(&self) -> &str {
        &self.pending_puzzle_id
    }

    pub fn set_puzzles(&mut self, puzzles: Vec<CrosswordPuzzleInfo>) {
        self.puzzles = puzzles;
    }

    pub fn select_puzzle(&mut self, puzzle_id: &str) -> Result<(), String> {
        if !self.puzzles.iter().any(|puzzle| puzzle.id == puzzle_id) {
            return Err("Crossword not found".into());
        }
        self.pending_puzzle_id = puzzle_id.to_string();
        Ok(())
    }

    pub fn set_puzzle(&mut self, puzzle: CrosswordPuzzleFile, words: Vec<CrosswordWord>) {
        self.public_puzzle = to_public_crossword_puzzle(&puzzle, &words);
        self.pending_puzzle_id = puzzle.id.clone();
        self.puzzle = puzzle;
        self.words = words;
    }

    pub fn ensure_player(&mut self, player_id: &str, name: &str) {
        if let Some(existing) = self.players.get_mut(player_id) {
            existing.name = name.to_string();
            return;
        }
        let letters = empty_letter_grid(&self.puzzle);
        self.players.insert(
            player_id.to_string(),
            PlayerProgress {
                player_id: player_id.to_string(),
                name: name.to_string(),
                letters,
                correct_word_ids: Vec::new(),
                elapsed_ms: 0,
                active_since: None,
                timer_started: false,
                completed_at: None,
            },
        );
    }

    pub fn pause_timer(&mut self, player_id: &str) {
        let now = self.now();
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if player.active_since.is_none() || player.completed_at.is_some() {
            return;
        }
        player.elapsed_ms = current_elapsed_ms(player.elapsed_ms, player.active_since, player.completed_at, now);
        player.active_since = None;
    }

    pub fn resume_timer(&mut self, player_id: &str) {
        let now = self.now();
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if !player.timer_started || player.completed_at.is_some() || player.active_since.is_some() {
            return;
        }
        player.active_since = Some(now);
    }

    pub fn set_letter(
        &mut self,
        player_id: &str,
        row: i64,
        col: i64,
        letter: &str,
    ) -> Result<Vec<String>, String> {
        if !self.players.contains_key(player_id) {
            return Err("Join the crossword first".into());
        }
        if !self.is_open_cell(row, col) {
            return Err("Invalid cell".into());
        }
        let normalized = letter.trim().to_uppercase();
        if normalized.len() != 1 || !normalized.chars().all(|ch| ch.is_ascii_uppercase()) {
            return Err("Enter a single letter".into());
        }
        let now = self.now();
        {
            let player = self.players.get_mut(player_id).expect("player");
            if !player.timer_started {
                player.timer_started = true;
                player.active_since = Some(now);
            } else if player.completed_at.is_none() && player.active_since.is_none() {
                player.active_since = Some(now);
            }
            player.letters[row as usize][col as usize] = Some(normalized);
        }
        self.recompute_words(player_id);
        Ok(self
            .players
            .get(player_id)
            .map(|player| player.correct_word_ids.clone())
            .unwrap_or_default())
    }

    pub fn clear_letter(
        &mut self,
        player_id: &str,
        row: i64,
        col: i64,
    ) -> Result<Vec<String>, String> {
        if !self.players.contains_key(player_id) {
            return Err("Join the crossword first".into());
        }
        if !self.is_open_cell(row, col) {
            return Err("Invalid cell".into());
        }
        self.players.get_mut(player_id).expect("player").letters[row as usize][col as usize] =
            Some(String::new());
        self.recompute_words(player_id);
        Ok(self.players.get(player_id).unwrap().correct_word_ids.clone())
    }

    fn is_open_cell(&self, row: i64, col: i64) -> bool {
        row >= 0
            && col >= 0
            && (row as usize) < self.puzzle.grid.len()
            && (col as usize) < self.puzzle.grid.first().map(|row| row.len()).unwrap_or(0)
            && self.puzzle.grid[row as usize][col as usize].is_some()
    }

    fn recompute_words(&mut self, player_id: &str) {
        let now = self.now();
        let next: Vec<String> = self
            .words
            .iter()
            .filter(|word| {
                let player = self.players.get(player_id).expect("player");
                let filled: Vec<String> = word
                    .cells
                    .iter()
                    .map(|cell| {
                        player.letters[cell.row as usize][cell.col as usize]
                            .clone()
                            .unwrap_or_default()
                    })
                    .collect();
                filled.iter().all(|letter| !letter.is_empty()) && filled.join("") == word.answer
            })
            .map(|word| word.id.clone())
            .collect();
        let word_count = self.words.len();
        let player = self.players.get_mut(player_id).expect("player");
        player.correct_word_ids = next;
        let complete = player.correct_word_ids.len() == word_count;
        if complete {
            if player.completed_at.is_none() {
                player.elapsed_ms = current_elapsed_ms(
                    player.elapsed_ms,
                    player.active_since,
                    player.completed_at,
                    now,
                );
                player.active_since = None;
                player.completed_at = Some(now);
            }
        } else if player.completed_at.is_some() {
            player.completed_at = None;
            player.active_since = Some(now);
        }
    }

    pub fn player_snapshot(&self, player_id: &str) -> Option<CrosswordPlayerSnapshot> {
        let player = self.players.get(player_id)?;
        Some(CrosswordPlayerSnapshot {
            puzzle: self.public_puzzle.clone(),
            letters: player.letters.clone(),
            correct_word_ids: player.correct_word_ids.clone(),
            completed: player.completed_at.is_some(),
            elapsed_ms: player.elapsed_ms,
            active_since: player.active_since,
            completed_at: player.completed_at,
            total_words: self.words.len() as i64,
        })
    }

    fn sort_elapsed(player: &CrosswordAdminEntry, now: i64) -> i64 {
        if player.completed_at.is_none() && player.active_since.is_none() && player.elapsed_ms == 0 {
            return i64::MAX;
        }
        current_elapsed_ms(player.elapsed_ms, player.active_since, player.completed_at, now)
    }

    pub fn admin_snapshot(&self) -> CrosswordAdminSnapshot {
        let now = self.now();
        let mut entries: Vec<CrosswordAdminEntry> = self
            .players
            .values()
            .map(|player| CrosswordAdminEntry {
                player_id: player.player_id.clone(),
                name: player.name.clone(),
                correct_word_count: player.correct_word_ids.len() as i64,
                total_words: self.words.len() as i64,
                score: 0,
                elapsed_ms: player.elapsed_ms,
                active_since: player.active_since,
                completed_at: player.completed_at,
            })
            .collect();
        entries.sort_by(|a, b| {
            b.correct_word_count.cmp(&a.correct_word_count).then_with(|| {
                Self::sort_elapsed(a, now)
                    .cmp(&Self::sort_elapsed(b, now))
                    .then_with(|| a.name.cmp(&b.name))
            })
        });
        for (index, entry) in entries.iter_mut().enumerate() {
            entry.score = crossword_score(entry.correct_word_count, (index + 1) as i64);
        }
        CrosswordAdminSnapshot {
            puzzle_id: self.puzzle.id.clone(),
            title: self.puzzle.title.clone(),
            pending_puzzle_id: self.pending_puzzle_id.clone(),
            puzzles: self.puzzles.clone(),
            total_words: self.words.len() as i64,
            players: entries,
        }
    }

    pub fn reset_player(&mut self, player_id: &str) -> Result<(), String> {
        let grid = empty_letter_grid(&self.puzzle);
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Player not found".into());
        };
        player.letters = grid;
        player.correct_word_ids.clear();
        player.elapsed_ms = 0;
        player.active_since = None;
        player.timer_started = false;
        player.completed_at = None;
        Ok(())
    }

    pub fn reset(&mut self) {
        let grid = empty_letter_grid(&self.puzzle);
        for player in self.players.values_mut() {
            player.letters = grid.clone();
            player.correct_word_ids.clear();
            player.elapsed_ms = 0;
            player.active_since = None;
            player.timer_started = false;
            player.completed_at = None;
        }
    }

    pub fn remove_player(&mut self, player_id: &str) {
        self.players.shift_remove(player_id);
    }

    pub fn clear_players(&mut self) {
        self.players.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::NOON_2026_MS;
    use crate::crossword::{derive_crossword_words, CrosswordClueDef, CrosswordPuzzleFile};

    fn mini() -> CrosswordPuzzleFile {
        CrosswordPuzzleFile {
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
        }
    }

    fn engine_at(start: i64) -> CrosswordEngine {
        let puzzle = mini();
        let words = derive_crossword_words(&puzzle).unwrap();
        CrosswordEngine::with_clock(puzzle, words, None, None, Clock::manual(start))
    }

    fn fill_all(engine: &mut CrosswordEngine, player_id: &str) {
        for (row, col, letter) in [(0, 0, "P"), (0, 1, "I"), (0, 2, "E"), (1, 0, "A"), (2, 0, "N")] {
            engine.set_letter(player_id, row, col, letter).unwrap();
        }
    }

    #[test]
    fn word_correct_only_when_full() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.set_letter("p1", 0, 0, "P").unwrap();
        engine.set_letter("p1", 0, 1, "I").unwrap();
        assert!(engine.player_snapshot("p1").unwrap().correct_word_ids.is_empty());
        let filled = engine.set_letter("p1", 0, 2, "E").unwrap();
        assert_eq!(filled, vec!["across-1".to_string()]);
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.correct_word_ids.contains(&"across-1".to_string()));
        assert!(!snap.completed);
    }

    #[test]
    fn completes_when_all_words_correct() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        fill_all(&mut engine, "p1");
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.completed);
        assert_eq!(snap.correct_word_ids.len(), 2);
    }

    #[test]
    fn accumulates_play_time_and_pauses() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 0);
        assert!(engine.player_snapshot("p1").unwrap().active_since.is_none());
        engine.set_letter("p1", 0, 0, "P").unwrap();
        assert_eq!(engine.player_snapshot("p1").unwrap().active_since, Some(NOON_2026_MS));
        engine.clock().set(NOON_2026_MS + 30_000);
        engine.pause_timer("p1");
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.elapsed_ms, 30_000);
        assert!(snap.active_since.is_none());
        engine.clock().set(NOON_2026_MS + 330_000);
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 30_000);
        engine.resume_timer("p1");
        assert_eq!(
            engine.player_snapshot("p1").unwrap().active_since,
            Some(NOON_2026_MS + 330_000)
        );
        engine.clock().set(NOON_2026_MS + 340_000);
        engine.pause_timer("p1");
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 40_000);
        engine.reset();
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.elapsed_ms, 0);
        assert!(snap.active_since.is_none());
        assert!(snap.completed_at.is_none());
    }

    #[test]
    fn freezes_time_on_completion() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.set_letter("p1", 0, 0, "P").unwrap();
        engine.clock().set(NOON_2026_MS + 45_000);
        fill_all(&mut engine, "p1");
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.completed);
        assert_eq!(snap.elapsed_ms, 45_000);
        assert!(snap.active_since.is_none());
        engine.clock().set(NOON_2026_MS + 600_000);
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 45_000);
    }

    #[test]
    fn sorts_admin_by_words_then_time() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        engine.ensure_player("b", "Bea");
        engine.ensure_player("c", "Cal");
        engine.clock().set(NOON_2026_MS);
        engine.set_letter("c", 0, 0, "P").unwrap();
        engine.clock().set(NOON_2026_MS + 10_000);
        engine.set_letter("c", 0, 1, "I").unwrap();
        engine.set_letter("c", 0, 2, "E").unwrap();
        engine.pause_timer("c");
        engine.clock().set(NOON_2026_MS);
        engine.set_letter("a", 0, 0, "P").unwrap();
        engine.clock().set(NOON_2026_MS + 60_000);
        fill_all(&mut engine, "a");
        engine.clock().set(NOON_2026_MS + 120_000);
        engine.set_letter("b", 0, 0, "P").unwrap();
        engine.clock().set(NOON_2026_MS + 150_000);
        fill_all(&mut engine, "b");
        let admin = engine.admin_snapshot();
        let names: Vec<_> = admin.players.iter().map(|player| player.name.as_str()).collect();
        assert_eq!(names, ["Bea", "Ada", "Cal"]);
        assert_eq!(admin.players[0].elapsed_ms, 30_000);
        assert_eq!(admin.players[1].elapsed_ms, 60_000);
        let scores: Vec<_> = admin.players.iter().map(|player| player.score).collect();
        assert_eq!(scores, [1200, 1100, 900]);
    }

    #[test]
    fn pending_puzzle_until_reset() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.set_puzzles(vec![
            CrosswordPuzzleInfo {
                id: "mini".into(),
                label: "mini.json".into(),
            },
            CrosswordPuzzleInfo {
                id: "other".into(),
                label: "other.json".into(),
            },
        ]);
        engine.select_puzzle("other").unwrap();
        assert_eq!(engine.pending_puzzle_id(), "other");
        assert_eq!(engine.active_puzzle_id(), "mini");
        let other = CrosswordPuzzleFile {
            id: "other".into(),
            title: "Other".into(),
            grid: vec![
                vec![Some("C".into()), Some("A".into()), Some("T".into())],
                vec![Some("U".into()), None, None],
                vec![Some("P".into()), None, None],
            ],
            across: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "Pet".into(),
            }],
            down: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "Trophy".into(),
            }],
        };
        let words = derive_crossword_words(&other).unwrap();
        engine.ensure_player("p1", "Buddy");
        engine.set_letter("p1", 0, 0, "P").unwrap();
        engine.set_puzzle(other, words);
        engine.reset();
        assert_eq!(engine.active_puzzle_id(), "other");
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.puzzle.title, "Other");
        assert_eq!(snap.letters[0][0].as_deref(), Some(""));
        assert_eq!(snap.total_words, 2);
    }

    #[test]
    fn recomputes_scores_when_player_joins() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        fill_all(&mut engine, "a");
        assert_eq!(engine.admin_snapshot().players[0].score, 1200);
        engine.ensure_player("b", "Bea");
        let admin = engine.admin_snapshot();
        let names: Vec<_> = admin.players.iter().map(|player| player.name.as_str()).collect();
        assert_eq!(names, ["Ada", "Bea"]);
        assert_eq!(admin.players[0].score, 1200);
        assert_eq!(admin.players[1].score, 900);
    }

    #[test]
    fn reset_player_clears_one_grid() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        engine.ensure_player("b", "Bea");
        engine.set_letter("a", 0, 0, "P").unwrap();
        engine.set_letter("b", 0, 1, "I").unwrap();
        engine.reset_player("a").unwrap();
        let ada = engine.player_snapshot("a").unwrap();
        assert_eq!(ada.letters[0][0].as_deref(), Some(""));
        assert!(ada.correct_word_ids.is_empty());
        assert_eq!(ada.elapsed_ms, 0);
        assert!(!ada.completed);
        assert_eq!(
            engine.player_snapshot("b").unwrap().letters[0][1].as_deref(),
            Some("I")
        );
        assert_eq!(engine.admin_snapshot().players[0].player_id, "b");
    }

    #[test]
    fn reset_clears_progress_and_keeps_players() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.set_letter("p1", 0, 0, "P").unwrap();
        engine.reset();
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.letters[0][0].as_deref(), Some(""));
        assert!(snap.correct_word_ids.is_empty());
        assert_eq!(engine.admin_snapshot().players.len(), 1);
        assert_eq!(engine.admin_snapshot().players[0].score, 1000);
    }
}
