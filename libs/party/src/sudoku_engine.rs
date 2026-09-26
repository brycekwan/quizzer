use std::collections::{BTreeSet, HashSet};

use indexmap::IndexMap;

use crate::clock::Clock;
use crate::sudoku::{
    parsed_grids, sudoku_admin_score, sudoku_player_score, to_public_sudoku, validate_sudoku_file,
    SudokuAdminEntry, SudokuAdminSnapshot, SudokuCellState, SudokuFile, SudokuPlayerSnapshot,
    SudokuPublicPuzzle, SudokuPuzzleInfo, SUDOKU_HINT_MAX, SUDOKU_SIZE,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum SolvedBy {
    Player,
    Hint,
}

#[derive(Clone, Default)]
struct Notes {
    drafts: BTreeSet<u8>,
    wrong: BTreeSet<u8>,
}

struct PlayerProgress {
    player_id: String,
    name: String,
    solved: [[Option<SolvedBy>; SUDOKU_SIZE]; SUDOKU_SIZE],
    notes: [[Notes; SUDOKU_SIZE]; SUDOKU_SIZE],
    penalties: HashSet<(usize, usize, u8)>,
    incorrect_count: i64,
    hints_used: i64,
    elapsed_ms: i64,
    active_since: Option<i64>,
    timer_started: bool,
    completed_at: Option<i64>,
}

fn current_elapsed_ms(
    elapsed_ms: i64,
    active_since: Option<i64>,
    completed_at: Option<i64>,
    now: i64,
) -> i64 {
    if completed_at.is_some() {
        return elapsed_ms;
    }
    match active_since {
        None => elapsed_ms,
        Some(started) => elapsed_ms + (now - started).max(0),
    }
}

fn empty_solved() -> [[Option<SolvedBy>; SUDOKU_SIZE]; SUDOKU_SIZE] {
    [[None; SUDOKU_SIZE]; SUDOKU_SIZE]
}

fn empty_notes() -> [[Notes; SUDOKU_SIZE]; SUDOKU_SIZE] {
    std::array::from_fn(|_| std::array::from_fn(|_| Notes::default()))
}

fn correct_count(player: &PlayerProgress) -> i64 {
    player
        .solved
        .iter()
        .flatten()
        .filter(|cell| **cell == Some(SolvedBy::Player))
        .count() as i64
}

pub struct SudokuEngine {
    puzzle: SudokuFile,
    solution: [[u8; SUDOKU_SIZE]; SUDOKU_SIZE],
    givens: [[Option<u8>; SUDOKU_SIZE]; SUDOKU_SIZE],
    public_puzzle: SudokuPublicPuzzle,
    pending_puzzle_id: String,
    puzzles: Vec<SudokuPuzzleInfo>,
    players: IndexMap<String, PlayerProgress>,
    clock: Clock,
}

impl SudokuEngine {
    pub fn new(puzzle: SudokuFile) -> Result<Self, String> {
        Self::with_clock(puzzle, None, None, Clock::system())
    }

    pub fn with_clock(
        puzzle: SudokuFile,
        puzzles: Option<Vec<SudokuPuzzleInfo>>,
        pending_puzzle_id: Option<String>,
        clock: Clock,
    ) -> Result<Self, String> {
        if let Some(error) = validate_sudoku_file(&puzzle) {
            return Err(error);
        }
        let (solution, givens) = parsed_grids(&puzzle)?;
        let public_puzzle = to_public_sudoku(&puzzle);
        let puzzles = puzzles.unwrap_or_else(|| {
            vec![SudokuPuzzleInfo {
                id: puzzle.id.clone(),
                label: format!("{}.json", puzzle.id),
            }]
        });
        let pending_puzzle_id = pending_puzzle_id.unwrap_or_else(|| puzzle.id.clone());
        Ok(Self {
            puzzle,
            solution,
            givens,
            public_puzzle,
            pending_puzzle_id,
            puzzles,
            players: IndexMap::new(),
            clock,
        })
    }

    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    fn now(&self) -> i64 {
        self.clock.now()
    }

    pub fn active_puzzle_id(&self) -> &str {
        &self.puzzle.id
    }

    pub fn pending_puzzle_id(&self) -> &str {
        &self.pending_puzzle_id
    }

    pub fn set_puzzles(&mut self, puzzles: Vec<SudokuPuzzleInfo>) {
        self.puzzles = puzzles;
    }

    pub fn select_puzzle(&mut self, puzzle_id: &str) -> Result<(), String> {
        if !self.puzzles.iter().any(|puzzle| puzzle.id == puzzle_id) {
            return Err("Sudoku not found".into());
        }
        self.pending_puzzle_id = puzzle_id.to_string();
        Ok(())
    }

    pub fn set_puzzle(&mut self, puzzle: SudokuFile) -> Result<(), String> {
        if let Some(error) = validate_sudoku_file(&puzzle) {
            return Err(error);
        }
        let (solution, givens) = parsed_grids(&puzzle)?;
        self.public_puzzle = to_public_sudoku(&puzzle);
        self.pending_puzzle_id = puzzle.id.clone();
        self.puzzle = puzzle;
        self.solution = solution;
        self.givens = givens;
        Ok(())
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
                solved: empty_solved(),
                notes: empty_notes(),
                penalties: HashSet::new(),
                incorrect_count: 0,
                hints_used: 0,
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
        player.elapsed_ms = current_elapsed_ms(
            player.elapsed_ms,
            player.active_since,
            player.completed_at,
            now,
        );
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

    pub fn commit(
        &mut self,
        player_id: &str,
        row: i64,
        col: i64,
        value: i64,
    ) -> Result<bool, String> {
        let (row, col) = self.open_cell(player_id, row, col)?;
        let value = digit(value)?;
        self.note_entry(player_id);
        let correct = value == self.solution[row][col];
        let now = self.now();
        let player = self.players.get_mut(player_id).expect("player");
        if correct {
            player.solved[row][col] = Some(SolvedBy::Player);
            player.notes[row][col] = Notes::default();
        } else if player.penalties.insert((row, col, value)) {
            player.incorrect_count += 1;
            player.notes[row][col].drafts.insert(value);
            player.notes[row][col].wrong.insert(value);
        } else {
            player.notes[row][col].drafts.insert(value);
            player.notes[row][col].wrong.insert(value);
        }
        self.maybe_complete(player_id, now);
        Ok(correct)
    }

    pub fn toggle_draft(
        &mut self,
        player_id: &str,
        row: i64,
        col: i64,
        value: i64,
    ) -> Result<(), String> {
        let (row, col) = self.open_cell(player_id, row, col)?;
        let value = digit(value)?;
        self.note_entry(player_id);
        let player = self.players.get_mut(player_id).expect("player");
        if player.notes[row][col].drafts.contains(&value) {
            player.notes[row][col].drafts.remove(&value);
            player.notes[row][col].wrong.remove(&value);
        } else {
            player.notes[row][col].drafts.insert(value);
        }
        Ok(())
    }

    pub fn erase(&mut self, player_id: &str, row: i64, col: i64) -> Result<(), String> {
        let (row, col) = self.cell_index(row, col)?;
        if self.givens[row][col].is_some() {
            return Ok(());
        }
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Join the sudoku first".into());
        };
        if player.solved[row][col].is_some() {
            return Ok(());
        }
        let wrong: Vec<u8> = player.notes[row][col].wrong.iter().copied().collect();
        for value in wrong {
            player.notes[row][col].wrong.remove(&value);
            player.notes[row][col].drafts.remove(&value);
        }
        Ok(())
    }

    pub fn hint(
        &mut self,
        player_id: &str,
        row: Option<i64>,
        col: Option<i64>,
    ) -> Result<(), String> {
        if !self.players.contains_key(player_id) {
            return Err("Join the sudoku first".into());
        }
        if self
            .players
            .get(player_id)
            .expect("player")
            .completed_at
            .is_some()
        {
            return Err("The puzzle is already complete".into());
        }
        if self.players.get(player_id).expect("player").hints_used >= SUDOKU_HINT_MAX {
            return Err("No hints left".into());
        }
        let (row, col) = self.hint_target(player_id, row, col)?;
        self.note_entry(player_id);
        let now = self.now();
        let player = self.players.get_mut(player_id).expect("player");
        player.hints_used += 1;
        player.solved[row][col] = Some(SolvedBy::Hint);
        player.notes[row][col] = Notes::default();
        self.maybe_complete(player_id, now);
        Ok(())
    }

    fn hint_target(
        &self,
        player_id: &str,
        row: Option<i64>,
        col: Option<i64>,
    ) -> Result<(usize, usize), String> {
        let solved = self.players.get(player_id).expect("player").solved;
        if let (Some(row), Some(col)) = (row, col) {
            if let Ok((row, col)) = self.cell_index(row, col) {
                if self.givens[row][col].is_none() && solved[row][col].is_none() {
                    return Ok((row, col));
                }
            }
        }
        for row in 0..SUDOKU_SIZE {
            for col in 0..SUDOKU_SIZE {
                if self.givens[row][col].is_none() && solved[row][col].is_none() {
                    return Ok((row, col));
                }
            }
        }
        Err("No empty cell to hint".into())
    }

    fn cell_index(&self, row: i64, col: i64) -> Result<(usize, usize), String> {
        if !(0..SUDOKU_SIZE as i64).contains(&row) || !(0..SUDOKU_SIZE as i64).contains(&col) {
            return Err("Cell is off the board".into());
        }
        Ok((row as usize, col as usize))
    }

    fn open_cell(&self, player_id: &str, row: i64, col: i64) -> Result<(usize, usize), String> {
        let (row, col) = self.cell_index(row, col)?;
        let state = {
            let Some(player) = self.players.get(player_id) else {
                return Err("Join the sudoku first".into());
            };
            (
                player.completed_at.is_some(),
                player.solved[row][col].is_some(),
            )
        };
        if state.0 {
            return Err("The puzzle is already complete".into());
        }
        if self.givens[row][col].is_some() || state.1 {
            return Err("That cell is already filled".into());
        }
        Ok((row, col))
    }

    fn note_entry(&mut self, player_id: &str) {
        let now = self.now();
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if player.completed_at.is_some() {
            return;
        }
        if !player.timer_started {
            player.timer_started = true;
            player.active_since = Some(now);
        } else if player.active_since.is_none() {
            player.active_since = Some(now);
        }
    }

    fn maybe_complete(&mut self, player_id: &str, now: i64) {
        let solved = match self.players.get(player_id) {
            Some(player) if player.completed_at.is_none() => player.solved,
            _ => return,
        };
        let done = (0..SUDOKU_SIZE).all(|row| {
            (0..SUDOKU_SIZE)
                .all(|col| self.givens[row][col].is_some() || solved[row][col].is_some())
        });
        if !done {
            return;
        }
        let player = self.players.get_mut(player_id).expect("player");
        player.elapsed_ms = current_elapsed_ms(
            player.elapsed_ms,
            player.active_since,
            player.completed_at,
            now,
        );
        player.active_since = None;
        player.completed_at = Some(now);
    }

    pub fn player_snapshot(&self, player_id: &str) -> Option<SudokuPlayerSnapshot> {
        let (score, hints_used, completed, elapsed_ms, active_since, completed_at, solved, notes) = {
            let player = self.players.get(player_id)?;
            (
                player_points(player),
                player.hints_used,
                player.completed_at.is_some(),
                player.elapsed_ms,
                player.active_since,
                player.completed_at,
                player.solved,
                player.notes.clone(),
            )
        };
        Some(SudokuPlayerSnapshot {
            puzzle: self.public_puzzle.clone(),
            cells: board_cells(&self.solution, &self.givens, &solved, &notes),
            score,
            hints_used,
            hints_max: SUDOKU_HINT_MAX,
            completed,
            elapsed_ms,
            active_since,
            completed_at,
        })
    }

    fn sort_elapsed(
        elapsed_ms: i64,
        active_since: Option<i64>,
        completed_at: Option<i64>,
        now: i64,
    ) -> i64 {
        if completed_at.is_none() && active_since.is_none() && elapsed_ms == 0 {
            return i64::MAX;
        }
        current_elapsed_ms(elapsed_ms, active_since, completed_at, now)
    }

    pub fn admin_snapshot(&self) -> SudokuAdminSnapshot {
        let now = self.now();
        let mut ranked: Vec<(i64, SudokuAdminEntry)> = self
            .players
            .values()
            .map(|player| {
                (
                    player_points(player),
                    SudokuAdminEntry {
                        player_id: player.player_id.clone(),
                        name: player.name.clone(),
                        score: 0,
                        elapsed_ms: player.elapsed_ms,
                        active_since: player.active_since,
                        completed_at: player.completed_at,
                    },
                )
            })
            .collect();
        ranked.sort_by(|a, b| {
            b.0.cmp(&a.0).then_with(|| {
                Self::sort_elapsed(a.1.elapsed_ms, a.1.active_since, a.1.completed_at, now)
                    .cmp(&Self::sort_elapsed(
                        b.1.elapsed_ms,
                        b.1.active_since,
                        b.1.completed_at,
                        now,
                    ))
                    .then_with(|| a.1.name.cmp(&b.1.name))
            })
        });
        let players = ranked
            .into_iter()
            .enumerate()
            .map(|(index, (player_score, mut entry))| {
                entry.score = sudoku_admin_score(player_score, (index + 1) as i64);
                entry
            })
            .collect();
        SudokuAdminSnapshot {
            puzzle_id: self.puzzle.id.clone(),
            title: self.puzzle.title.clone(),
            pending_puzzle_id: self.pending_puzzle_id.clone(),
            puzzles: self.puzzles.clone(),
            players,
        }
    }

    fn clear_progress(player: &mut PlayerProgress) {
        player.solved = empty_solved();
        player.notes = empty_notes();
        player.penalties.clear();
        player.incorrect_count = 0;
        player.hints_used = 0;
        player.elapsed_ms = 0;
        player.active_since = None;
        player.timer_started = false;
        player.completed_at = None;
    }

    pub fn reset_player(&mut self, player_id: &str) -> Result<(), String> {
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Player not found".into());
        };
        Self::clear_progress(player);
        Ok(())
    }

    pub fn reset(&mut self) {
        for player in self.players.values_mut() {
            Self::clear_progress(player);
        }
    }

    pub fn remove_player(&mut self, player_id: &str) {
        self.players.shift_remove(player_id);
    }

    pub fn clear_players(&mut self) {
        self.players.clear();
    }
}

fn player_points(player: &PlayerProgress) -> i64 {
    sudoku_player_score(
        correct_count(player),
        player.incorrect_count,
        player.completed_at.is_some(),
        player.hints_used,
    )
}

fn board_cells(
    solution: &[[u8; SUDOKU_SIZE]; SUDOKU_SIZE],
    givens: &[[Option<u8>; SUDOKU_SIZE]; SUDOKU_SIZE],
    solved: &[[Option<SolvedBy>; SUDOKU_SIZE]; SUDOKU_SIZE],
    notes: &[[Notes; SUDOKU_SIZE]; SUDOKU_SIZE],
) -> Vec<Vec<SudokuCellState>> {
    let mut cells = Vec::with_capacity(SUDOKU_SIZE);
    for row in 0..SUDOKU_SIZE {
        let mut line = Vec::with_capacity(SUDOKU_SIZE);
        for col in 0..SUDOKU_SIZE {
            line.push(cell_state(solution, givens, solved, notes, row, col));
        }
        cells.push(line);
    }
    cells
}

fn cell_state(
    solution: &[[u8; SUDOKU_SIZE]; SUDOKU_SIZE],
    givens: &[[Option<u8>; SUDOKU_SIZE]; SUDOKU_SIZE],
    solved: &[[Option<SolvedBy>; SUDOKU_SIZE]; SUDOKU_SIZE],
    notes: &[[Notes; SUDOKU_SIZE]; SUDOKU_SIZE],
    row: usize,
    col: usize,
) -> SudokuCellState {
    if let Some(value) = givens[row][col] {
        return SudokuCellState {
            given: true,
            value: Some(value),
            solved: false,
            hinted: false,
            drafts: Vec::new(),
            wrong_drafts: Vec::new(),
        };
    }
    match solved[row][col] {
        Some(kind) => SudokuCellState {
            given: false,
            value: Some(solution[row][col]),
            solved: true,
            hinted: kind == SolvedBy::Hint,
            drafts: Vec::new(),
            wrong_drafts: Vec::new(),
        },
        None => SudokuCellState {
            given: false,
            value: None,
            solved: false,
            hinted: false,
            drafts: notes[row][col].drafts.iter().copied().collect(),
            wrong_drafts: notes[row][col].wrong.iter().copied().collect(),
        },
    }
}

fn digit(value: i64) -> Result<u8, String> {
    if !(1..=9).contains(&value) {
        return Err("Enter a number from 1 to 9".into());
    }
    Ok(value as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::NOON_2026_MS;
    use crate::sudoku::classic_sudoku_file;

    fn engine_at(start: i64) -> SudokuEngine {
        SudokuEngine::with_clock(classic_sudoku_file(), None, None, Clock::manual(start)).unwrap()
    }

    fn cell(engine: &SudokuEngine, player_id: &str, row: usize, col: usize) -> SudokuCellState {
        engine.player_snapshot(player_id).unwrap().cells[row][col].clone()
    }

    #[test]
    fn clock_stays_stopped_until_the_first_entry() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.resume_timer("p1");
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.active_since.is_none());
        assert_eq!(snap.elapsed_ms, 0);
        engine.toggle_draft("p1", 0, 2, 4).unwrap();
        assert_eq!(
            engine.player_snapshot("p1").unwrap().active_since,
            Some(NOON_2026_MS)
        );
        engine.reset_player("p1").unwrap();
        engine.resume_timer("p1");
        assert!(engine.player_snapshot("p1").unwrap().active_since.is_none());
        assert_eq!(engine.player_snapshot("p1").unwrap().score, 0);
    }

    #[test]
    fn correct_entry_locks_green_and_clears_notes() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.toggle_draft("p1", 0, 2, 1).unwrap();
        engine.toggle_draft("p1", 0, 2, 4).unwrap();
        assert!(engine.commit("p1", 0, 2, 4).unwrap());
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.score, 10);
        assert!(!snap.cells[0][2].given);
        assert!(snap.cells[0][2].solved);
        assert_eq!(snap.cells[0][2].value, Some(4));
        assert!(snap.cells[0][2].drafts.is_empty());
        assert!(engine.commit("p1", 0, 2, 4).is_err());
        assert!(snap.puzzle.id == "sample");
    }

    #[test]
    fn wrong_entry_keeps_other_notes_and_charges_once() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.toggle_draft("p1", 0, 2, 1).unwrap();
        engine.toggle_draft("p1", 0, 2, 2).unwrap();
        assert!(!engine.commit("p1", 0, 2, 1).unwrap());
        let marked = cell(&engine, "p1", 0, 2);
        assert_eq!(marked.value, None);
        assert_eq!(marked.drafts, vec![1, 2]);
        assert_eq!(marked.wrong_drafts, vec![1]);
        assert_eq!(engine.player_snapshot("p1").unwrap().score, -10);
        assert!(!engine.commit("p1", 0, 2, 1).unwrap());
        assert_eq!(engine.player_snapshot("p1").unwrap().score, -10);
    }

    #[test]
    fn erase_and_draft_toggle_remove_a_red_note_without_a_refund() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.toggle_draft("p1", 0, 2, 2).unwrap();
        engine.commit("p1", 0, 2, 1).unwrap();
        engine.toggle_draft("p1", 0, 2, 1).unwrap();
        let cleared = cell(&engine, "p1", 0, 2);
        assert_eq!(cleared.drafts, vec![2]);
        assert!(cleared.wrong_drafts.is_empty());
        assert_eq!(engine.player_snapshot("p1").unwrap().score, -10);
        engine.commit("p1", 0, 2, 9).unwrap();
        engine.erase("p1", 0, 2).unwrap();
        let left = cell(&engine, "p1", 0, 2);
        assert_eq!(left.drafts, vec![2]);
        assert!(left.wrong_drafts.is_empty());
        assert_eq!(engine.player_snapshot("p1").unwrap().score, -20);
    }

    #[test]
    fn hint_reveals_without_points_and_stops_at_three() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.hint("p1", Some(0), Some(2)).unwrap();
        let hinted = cell(&engine, "p1", 0, 2);
        assert!(hinted.solved && hinted.hinted);
        assert_eq!(hinted.value, Some(4));
        assert_eq!(engine.player_snapshot("p1").unwrap().score, 0);
        assert_eq!(engine.player_snapshot("p1").unwrap().hints_used, 1);
        engine.hint("p1", Some(0), Some(0)).unwrap();
        assert!(cell(&engine, "p1", 0, 3).hinted);
        engine.hint("p1", None, None).unwrap();
        assert_eq!(engine.hint("p1", None, None).unwrap_err(), "No hints left");
    }

    #[test]
    fn completion_adds_finish_and_leftover_hint_points_and_stops_the_clock() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.commit("p1", 0, 2, 4).unwrap();
        engine.clock().set(NOON_2026_MS + 12_000);
        engine.hint("p1", None, None).unwrap();
        let puzzle = classic_sudoku_file();
        for row in 0..9 {
            for col in 0..9 {
                if puzzle.givens[row][col].is_none()
                    && !engine.player_snapshot("p1").unwrap().cells[row][col].solved
                {
                    engine
                        .commit(
                            "p1",
                            row as i64,
                            col as i64,
                            puzzle.solution[row][col] as i64,
                        )
                        .unwrap();
                }
            }
        }
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.completed);
        assert_eq!(snap.elapsed_ms, 12_000);
        assert!(snap.active_since.is_none());
        let blanks = puzzle
            .givens
            .iter()
            .flatten()
            .filter(|cell| cell.is_none())
            .count() as i64;
        assert_eq!(snap.score, (blanks - 1) * 10 + 100 + 20);
        engine.clock().set(NOON_2026_MS + 90_000);
        engine.resume_timer("p1");
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 12_000);
    }

    #[test]
    fn clock_pauses_while_away() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        engine.commit("p1", 0, 2, 1).unwrap();
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
    fn ranks_by_score_then_shorter_time_and_hides_the_bonus_from_the_player() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("a", "Ada");
        engine.ensure_player("b", "Bea");
        engine.ensure_player("c", "Cal");
        engine.commit("a", 0, 2, 4).unwrap();
        engine.clock().set(NOON_2026_MS + 5_000);
        engine.pause_timer("a");
        engine.clock().set(NOON_2026_MS + 20_000);
        engine.commit("b", 0, 2, 4).unwrap();
        engine.clock().set(NOON_2026_MS + 40_000);
        engine.pause_timer("b");
        engine.commit("c", 0, 2, 1).unwrap();
        engine.pause_timer("c");
        let admin = engine.admin_snapshot();
        let names: Vec<_> = admin
            .players
            .iter()
            .map(|player| player.name.as_str())
            .collect();
        assert_eq!(names, ["Ada", "Bea", "Cal"]);
        assert_eq!(
            admin
                .players
                .iter()
                .map(|player| player.score)
                .collect::<Vec<_>>(),
            [1010, 910, 790]
        );
        assert_eq!(engine.player_snapshot("a").unwrap().score, 10);
        assert_eq!(engine.player_snapshot("c").unwrap().score, -10);
    }

    #[test]
    fn hides_the_solution_from_the_player_snapshot() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.ensure_player("p1", "Buddy");
        let snap = engine.player_snapshot("p1").unwrap();
        assert!(snap.cells[0][2].value.is_none());
        assert_eq!(snap.cells[0][0].value, Some(5));
        assert!(snap.cells[0][0].given);
    }

    #[test]
    fn holds_pending_puzzle() {
        let mut engine = engine_at(NOON_2026_MS);
        engine.set_puzzles(vec![
            SudokuPuzzleInfo {
                id: "sample".into(),
                label: "sample.json".into(),
            },
            SudokuPuzzleInfo {
                id: "other".into(),
                label: "other.json".into(),
            },
        ]);
        engine.select_puzzle("other").unwrap();
        assert_eq!(engine.pending_puzzle_id(), "other");
        assert_eq!(engine.active_puzzle_id(), "sample");
    }
}
