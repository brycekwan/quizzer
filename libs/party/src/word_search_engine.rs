use crate::clock::Clock;
use crate::word_search::{
    selection_matches_word, to_public_word_search, word_search_score, WordSearchAdminEntry,
    WordSearchAdminSnapshot, WordSearchCellRef, WordSearchFile, WordSearchFoundWord,
    WordSearchPlayerSnapshot, WordSearchPublicPuzzle, WordSearchPuzzleInfo, WordSearchWord,
};
use indexmap::IndexMap;

struct PlayerProgress {
    player_id: String,
    name: String,
    found: Vec<WordSearchFoundWord>,
    elapsed_ms: i64,
    active_since: Option<i64>,
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

pub struct WordSearchEngine {
    puzzle: WordSearchFile,
    words: Vec<WordSearchWord>,
    public_puzzle: WordSearchPublicPuzzle,
    pending_puzzle_id: String,
    puzzles: Vec<WordSearchPuzzleInfo>,
    players: IndexMap<String, PlayerProgress>,
    clock: Clock,
}

impl WordSearchEngine {
    pub fn new(puzzle: WordSearchFile, words: Vec<WordSearchWord>) -> Self {
        Self::with_clock(puzzle, words, None, None, Clock::system())
    }

    pub fn with_clock(
        puzzle: WordSearchFile,
        words: Vec<WordSearchWord>,
        puzzles: Option<Vec<WordSearchPuzzleInfo>>,
        pending_puzzle_id: Option<String>,
        clock: Clock,
    ) -> Self {
        let public_puzzle = to_public_word_search(&puzzle, &words);
        let puzzles = puzzles.unwrap_or_else(|| {
            vec![WordSearchPuzzleInfo {
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

    pub fn set_puzzles(&mut self, puzzles: Vec<WordSearchPuzzleInfo>) {
        self.puzzles = puzzles;
    }

    pub fn select_puzzle(&mut self, puzzle_id: &str) -> Result<(), String> {
        if !self.puzzles.iter().any(|puzzle| puzzle.id == puzzle_id) {
            return Err("Word search not found".into());
        }
        self.pending_puzzle_id = puzzle_id.to_string();
        Ok(())
    }

    pub fn set_puzzle(&mut self, puzzle: WordSearchFile, words: Vec<WordSearchWord>) {
        self.public_puzzle = to_public_word_search(&puzzle, &words);
        self.pending_puzzle_id = puzzle.id.clone();
        self.puzzle = puzzle;
        self.words = words;
    }

    pub fn ensure_player(&mut self, player_id: &str, name: &str) {
        if let Some(existing) = self.players.get_mut(player_id) {
            existing.name = name.to_string();
            return;
        }
        self.players.insert(
            player_id.to_string(),
            PlayerProgress {
                player_id: player_id.to_string(),
                name: name.to_string(),
                found: Vec::new(),
                elapsed_ms: 0,
                active_since: None,
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
        player.elapsed_ms =
            current_elapsed_ms(player.elapsed_ms, player.active_since, player.completed_at, now);
        player.active_since = None;
    }

    pub fn resume_timer(&mut self, player_id: &str) {
        let now = self.now();
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if player.completed_at.is_some() || player.active_since.is_some() {
            return;
        }
        player.active_since = Some(now);
    }

    pub fn submit_selection(
        &mut self,
        player_id: &str,
        cells: &[WordSearchCellRef],
    ) -> Result<bool, String> {
        if !self.players.contains_key(player_id) {
            return Err("Join the word search first".into());
        }
        if cells.is_empty() {
            return Ok(false);
        }
        let Some(matched) = self
            .words
            .iter()
            .find(|word| selection_matches_word(cells, word))
            .cloned()
        else {
            return Ok(false);
        };
        let already = self
            .players
            .get(player_id)
            .expect("player")
            .found
            .iter()
            .any(|found| found.id == matched.id);
        if !already {
            let now = self.now();
            let word_count = self.words.len();
            let player = self.players.get_mut(player_id).expect("player");
            player.found.push(WordSearchFoundWord {
                id: matched.id,
                word: matched.word,
                cells: matched.cells,
            });
            if player.found.len() == word_count && player.completed_at.is_none() {
                player.elapsed_ms = current_elapsed_ms(
                    player.elapsed_ms,
                    player.active_since,
                    player.completed_at,
                    now,
                );
                player.active_since = None;
                player.completed_at = Some(now);
            }
        }
        Ok(true)
    }

    pub fn player_snapshot(&self, player_id: &str) -> Option<WordSearchPlayerSnapshot> {
        let player = self.players.get(player_id)?;
        Some(WordSearchPlayerSnapshot {
            puzzle: self.public_puzzle.clone(),
            found: player.found.clone(),
            completed: player.completed_at.is_some(),
            elapsed_ms: player.elapsed_ms,
            active_since: player.active_since,
            completed_at: player.completed_at,
            total_words: self.words.len() as i64,
        })
    }

    fn sort_elapsed(player: &WordSearchAdminEntry, now: i64) -> i64 {
        if player.completed_at.is_none() && player.active_since.is_none() && player.elapsed_ms == 0 {
            return i64::MAX;
        }
        current_elapsed_ms(player.elapsed_ms, player.active_since, player.completed_at, now)
    }

    pub fn admin_snapshot(&self) -> WordSearchAdminSnapshot {
        let now = self.now();
        let mut entries: Vec<WordSearchAdminEntry> = self
            .players
            .values()
            .map(|player| WordSearchAdminEntry {
                player_id: player.player_id.clone(),
                name: player.name.clone(),
                found_count: player.found.len() as i64,
                total_words: self.words.len() as i64,
                score: 0,
                elapsed_ms: player.elapsed_ms,
                active_since: player.active_since,
                completed_at: player.completed_at,
            })
            .collect();
        entries.sort_by(|a, b| {
            b.found_count.cmp(&a.found_count).then_with(|| {
                Self::sort_elapsed(a, now)
                    .cmp(&Self::sort_elapsed(b, now))
                    .then_with(|| a.name.cmp(&b.name))
            })
        });
        for (index, entry) in entries.iter_mut().enumerate() {
            entry.score = word_search_score(entry.found_count, (index + 1) as i64);
        }
        WordSearchAdminSnapshot {
            puzzle_id: self.puzzle.id.clone(),
            title: self.puzzle.title.clone(),
            pending_puzzle_id: self.pending_puzzle_id.clone(),
            puzzles: self.puzzles.clone(),
            total_words: self.words.len() as i64,
            players: entries,
        }
    }

    pub fn reset_player(&mut self, player_id: &str) -> Result<(), String> {
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Player not found".into());
        };
        player.found.clear();
        player.elapsed_ms = 0;
        player.active_since = None;
        player.completed_at = None;
        Ok(())
    }

    pub fn reset(&mut self) {
        for player in self.players.values_mut() {
            player.found.clear();
            player.elapsed_ms = 0;
            player.active_since = None;
            player.completed_at = None;
        }
    }

    pub fn remove_player(&mut self, player_id: &str) {
        self.players.shift_remove(player_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::NOON_2026_MS;
    use crate::word_search::{WordSearchCellRef, WordSearchDirection, WordSearchFile, WordSearchPlacement, WordSearchWord};

    fn puzzle() -> WordSearchFile {
        WordSearchFile {
            id: "mini".into(),
            title: "Mini".into(),
            grid: vec![
                vec!["C".into(), "A".into(), "T".into(), "X".into()],
                vec!["X".into(), "X".into(), "X".into(), "O".into()],
                vec!["X".into(), "X".into(), "X".into(), "G".into()],
                vec!["D".into(), "O".into(), "G".into(), "X".into()],
            ],
            words: vec![
                placement("CAT", 0, 0, WordSearchDirection::E),
                placement("DOG", 0, 3, WordSearchDirection::S),
                placement("GOD", 3, 2, WordSearchDirection::W),
            ],
        }
    }

    fn placement(word: &str, row: i64, col: i64, direction: WordSearchDirection) -> WordSearchPlacement {
        WordSearchPlacement {
            word: word.into(),
            row,
            col,
            direction,
        }
    }

    fn words() -> Vec<WordSearchWord> {
        vec![
            word("CAT", 0, 0, WordSearchDirection::E, &[(0, 0), (0, 1), (0, 2)]),
            word("DOG", 0, 3, WordSearchDirection::S, &[(0, 3), (1, 3), (2, 3)]),
            word("GOD", 3, 2, WordSearchDirection::W, &[(3, 2), (3, 1), (3, 0)]),
        ]
    }

    fn word(name: &str, row: i64, col: i64, direction: WordSearchDirection, cells: &[(i64, i64)]) -> WordSearchWord {
        WordSearchWord {
            id: name.into(),
            word: name.into(),
            row,
            col,
            direction,
            cells: cells
                .iter()
                .map(|(row, col)| WordSearchCellRef { row: *row, col: *col })
                .collect(),
        }
    }

    fn engine_at(start: i64) -> WordSearchEngine {
        WordSearchEngine::with_clock(puzzle(), words(), None, None, Clock::manual(start))
    }

    #[test]
    fn accepts_forward_or_reversed() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.resume_timer("p1");
        assert!(!engine
            .submit_selection("p1", &[WordSearchCellRef { row: 0, col: 0 }, WordSearchCellRef { row: 0, col: 1 }])
            .unwrap());
        assert!(engine.player_snapshot("p1").unwrap().found.is_empty());
        assert!(engine
            .submit_selection(
                "p1",
                &[
                    WordSearchCellRef { row: 0, col: 2 },
                    WordSearchCellRef { row: 0, col: 1 },
                    WordSearchCellRef { row: 0, col: 0 },
                ],
            )
            .unwrap());
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.found[0].word, "CAT");
        assert_eq!(snap.found[0].cells, words()[0].cells);
        assert!(!snap.completed);
    }

    #[test]
    fn does_not_clear_when_sent_again() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        let cells = words()[0].cells.clone();
        engine.submit_selection("p1", &cells).unwrap();
        let mut reversed = cells.clone();
        reversed.reverse();
        engine.submit_selection("p1", &reversed).unwrap();
        assert_eq!(engine.player_snapshot("p1").unwrap().found.len(), 1);
    }

    #[test]
    fn clock_pauses_while_away() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.resume_timer("p1");
        assert_eq!(engine.player_snapshot("p1").unwrap().active_since, Some(NOON_2026_MS));
        engine.clock().set(NOON_2026_MS + 30_000);
        engine.pause_timer("p1");
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 30_000);
        engine.clock().set(NOON_2026_MS + 330_000);
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 30_000);
        engine.resume_timer("p1");
        engine.clock().set(NOON_2026_MS + 340_000);
        engine.pause_timer("p1");
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 40_000);
    }

    #[test]
    fn freezes_when_every_word_found() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.resume_timer("p1");
        engine.clock().set(NOON_2026_MS + 45_000);
        for word in words() {
            engine.submit_selection("p1", &word.cells).unwrap();
        }
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.completed);
        assert_eq!(snap.elapsed_ms, 45_000);
        engine.clock().set(NOON_2026_MS + 600_000);
        engine.resume_timer("p1");
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.elapsed_ms, 45_000);
        assert!(snap.active_since.is_none());
    }

    #[test]
    fn sorts_by_words_then_time() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        engine.ensure_player("b", "Bea");
        engine.ensure_player("c", "Cal");
        let found = words();
        engine.clock().set(NOON_2026_MS);
        engine.resume_timer("c");
        engine.clock().set(NOON_2026_MS + 10_000);
        engine.submit_selection("c", &found[0].cells).unwrap();
        engine.pause_timer("c");
        engine.clock().set(NOON_2026_MS + 60_000);
        engine.resume_timer("a");
        engine.clock().set(NOON_2026_MS + 120_000);
        engine.submit_selection("a", &found[0].cells).unwrap();
        engine.submit_selection("a", &found[1].cells).unwrap();
        engine.pause_timer("a");
        engine.clock().set(NOON_2026_MS + 180_000);
        engine.resume_timer("b");
        engine.clock().set(NOON_2026_MS + 210_000);
        engine.submit_selection("b", &found[0].cells).unwrap();
        engine.submit_selection("b", &found[1].cells).unwrap();
        engine.pause_timer("b");
        let admin = engine.admin_snapshot();
        let names: Vec<_> = admin.players.iter().map(|player| player.name.as_str()).collect();
        assert_eq!(names, ["Bea", "Ada", "Cal"]);
        assert_eq!(admin.players[0].elapsed_ms, 30_000);
        assert_eq!(admin.players[1].elapsed_ms, 60_000);
        assert_eq!(admin.players[2].found_count, 1);
        let scores: Vec<_> = admin.players.iter().map(|player| player.score).collect();
        assert_eq!(scores, [1200, 1100, 900]);
    }

    #[test]
    fn resets_one_player() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        engine.ensure_player("b", "Bea");
        engine.resume_timer("a");
        let found = words();
        engine.submit_selection("a", &found[0].cells).unwrap();
        engine.submit_selection("b", &found[1].cells).unwrap();
        engine.reset_player("a").unwrap();
        assert!(engine.player_snapshot("a").unwrap().found.is_empty());
        assert_eq!(engine.player_snapshot("a").unwrap().elapsed_ms, 0);
        assert_eq!(
            engine.player_snapshot("b").unwrap().found[0].word,
            "DOG"
        );
    }

    #[test]
    fn holds_pending_puzzle() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.set_puzzles(vec![
            WordSearchPuzzleInfo {
                id: "mini".into(),
                label: "mini.json".into(),
            },
            WordSearchPuzzleInfo {
                id: "canada".into(),
                label: "canada.json".into(),
            },
        ]);
        engine.select_puzzle("canada").unwrap();
        assert_eq!(engine.pending_puzzle_id(), "canada");
        assert_eq!(engine.active_puzzle_id(), "mini");
        assert_eq!(engine.admin_snapshot().pending_puzzle_id, "canada");
    }
}
