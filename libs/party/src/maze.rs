use serde::{Deserialize, Serialize};

pub const MAZE_EASY_SIZE: i64 = 12;
pub const MAZE_MEDIUM_SIZE: i64 = 15;
pub const MAZE_HARD_SIZE: i64 = 20;
pub const MAZE_POINTS_EASY: i64 = 200;
pub const MAZE_POINTS_MEDIUM: i64 = 300;
pub const MAZE_POINTS_HARD: i64 = 500;
pub const MAZE_POINTS_PER_HEART: i64 = 50;
pub const MAZE_LIVES: i64 = 3;
pub const MAZE_SPLASH_MS: i64 = 5_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MazeDifficulty {
    Easy,
    Medium,
    Hard,
}

impl MazeDifficulty {
    pub fn size(self) -> i64 {
        match self {
            Self::Easy => MAZE_EASY_SIZE,
            Self::Medium => MAZE_MEDIUM_SIZE,
            Self::Hard => MAZE_HARD_SIZE,
        }
    }

    pub fn points(self) -> i64 {
        match self {
            Self::Easy => MAZE_POINTS_EASY,
            Self::Medium => MAZE_POINTS_MEDIUM,
            Self::Hard => MAZE_POINTS_HARD,
        }
    }

    pub fn next(self) -> Option<Self> {
        match self {
            Self::Easy => Some(Self::Medium),
            Self::Medium => Some(Self::Hard),
            Self::Hard => None,
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "easy" => Some(Self::Easy),
            "medium" => Some(Self::Medium),
            "hard" => Some(Self::Hard),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MazePhase {
    Intro,
    Playing,
    Splash,
    Won,
    Lost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MazeDirection {
    #[serde(rename = "n")]
    N,
    #[serde(rename = "e")]
    E,
    #[serde(rename = "s")]
    S,
    #[serde(rename = "w")]
    W,
}

impl MazeDirection {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "n" => Some(Self::N),
            "e" => Some(Self::E),
            "s" => Some(Self::S),
            "w" => Some(Self::W),
            _ => None,
        }
    }

    pub fn delta(self) -> (i64, i64) {
        match self {
            Self::N => (-1, 0),
            Self::E => (0, 1),
            Self::S => (1, 0),
            Self::W => (0, -1),
        }
    }

    pub fn opposite(self) -> Self {
        match self {
            Self::N => Self::S,
            Self::E => Self::W,
            Self::S => Self::N,
            Self::W => Self::E,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazeCellRef {
    pub row: i64,
    pub col: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MazeWalls {
    pub n: bool,
    pub e: bool,
    pub s: bool,
    pub w: bool,
}

impl MazeWalls {
    pub fn all() -> Self {
        Self {
            n: true,
            e: true,
            s: true,
            w: true,
        }
    }

    pub fn blocked(self, direction: MazeDirection) -> bool {
        match direction {
            MazeDirection::N => self.n,
            MazeDirection::E => self.e,
            MazeDirection::S => self.s,
            MazeDirection::W => self.w,
        }
    }

    pub fn set(&mut self, direction: MazeDirection, blocked: bool) {
        match direction {
            MazeDirection::N => self.n = blocked,
            MazeDirection::E => self.e = blocked,
            MazeDirection::S => self.s = blocked,
            MazeDirection::W => self.w = blocked,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazeFile {
    pub id: String,
    pub title: String,
    pub rows: i64,
    pub cols: i64,
    pub start: MazeCellRef,
    pub target: MazeCellRef,
    pub open: Vec<Vec<bool>>,
    pub walls: Vec<Vec<MazeWalls>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazePublicPuzzle {
    pub id: String,
    pub title: String,
    pub difficulty: MazeDifficulty,
    pub rows: i64,
    pub cols: i64,
    pub start: MazeCellRef,
    pub target: MazeCellRef,
    pub open: Vec<Vec<bool>>,
    pub walls: Vec<Vec<MazeWalls>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazePlayerSnapshot {
    pub level: MazeDifficulty,
    pub puzzle: MazePublicPuzzle,
    pub position: MazeCellRef,
    pub visited: Vec<MazeCellRef>,
    pub lives: i64,
    pub score: i64,
    pub phase: MazePhase,
    pub splash_until: Option<i64>,
    pub levels_cleared: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazePuzzleInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazeLevelChoice {
    pub puzzle_id: String,
    pub title: String,
    pub pending_puzzle_id: String,
    pub puzzles: Vec<MazePuzzleInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazeAdminEntry {
    pub player_id: String,
    pub name: String,
    pub score: i64,
    pub level: MazeDifficulty,
    pub lives: i64,
    pub phase: MazePhase,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MazeAdminSnapshot {
    pub easy: MazeLevelChoice,
    pub medium: MazeLevelChoice,
    pub hard: MazeLevelChoice,
    pub players: Vec<MazeAdminEntry>,
}

pub fn maze_campaign_score(levels_cleared: i64, lives: i64, phase: MazePhase) -> i64 {
    let mut score = 0;
    if levels_cleared >= 1 {
        score += MAZE_POINTS_EASY;
    }
    if levels_cleared >= 2 {
        score += MAZE_POINTS_MEDIUM;
    }
    if levels_cleared >= 3 {
        score += MAZE_POINTS_HARD;
    }
    if phase == MazePhase::Won {
        score += lives.max(0) * MAZE_POINTS_PER_HEART;
    }
    score
}

pub fn to_public_maze(puzzle: &MazeFile, difficulty: MazeDifficulty) -> MazePublicPuzzle {
    MazePublicPuzzle {
        id: puzzle.id.clone(),
        title: puzzle.title.clone(),
        difficulty,
        rows: puzzle.rows,
        cols: puzzle.cols,
        start: puzzle.start,
        target: puzzle.target,
        open: puzzle.open.clone(),
        walls: puzzle.walls.clone(),
    }
}

pub fn validate_maze_file(puzzle: &MazeFile, difficulty: MazeDifficulty) -> Option<String> {
    let size = difficulty.size();
    if puzzle.rows != size || puzzle.cols != size {
        return Some(format!(
            "{} maze must be {size}×{size}",
            difficulty_label(difficulty)
        ));
    }
    if puzzle.open.len() as i64 != size || puzzle.walls.len() as i64 != size {
        return Some(format!(
            "{} maze must be {size}×{size}",
            difficulty_label(difficulty)
        ));
    }
    for row in 0..size {
        let open_row = puzzle.open.get(row as usize)?;
        let wall_row = puzzle.walls.get(row as usize)?;
        if open_row.len() as i64 != size || wall_row.len() as i64 != size {
            return Some(format!(
                "{} maze must be {size}×{size}",
                difficulty_label(difficulty)
            ));
        }
    }
    if !in_bounds(puzzle.start, size) || !cell_open(puzzle, puzzle.start) {
        return Some("Start must be an open cell".into());
    }
    if !in_bounds(puzzle.target, size) || !cell_open(puzzle, puzzle.target) {
        return Some("Target must be an open cell".into());
    }
    if puzzle.start == puzzle.target {
        return Some("Start and target must be different cells".into());
    }
    for row in 0..size {
        for col in 0..size {
            let cell = MazeCellRef { row, col };
            for direction in [MazeDirection::N, MazeDirection::E, MazeDirection::S, MazeDirection::W]
            {
                let (dr, dc) = direction.delta();
                let next = MazeCellRef {
                    row: row + dr,
                    col: col + dc,
                };
                let blocked = walls_at(puzzle, cell).blocked(direction);
                if !in_bounds(next, size) {
                    if !blocked {
                        return Some(format!("Outer border at {row},{col} must be walled"));
                    }
                    continue;
                }
                let opposite = walls_at(puzzle, next).blocked(direction.opposite());
                if blocked != opposite {
                    return Some(format!("Walls at {row},{col} are not symmetric"));
                }
            }
        }
    }
    if !target_reachable(puzzle) {
        return Some("Target must be reachable without revisiting a cell".into());
    }
    None
}

fn difficulty_label(difficulty: MazeDifficulty) -> &'static str {
    match difficulty {
        MazeDifficulty::Easy => "Easy",
        MazeDifficulty::Medium => "Medium",
        MazeDifficulty::Hard => "Hard",
    }
}

pub fn in_bounds(cell: MazeCellRef, size: i64) -> bool {
    cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size
}

pub fn cell_open(puzzle: &MazeFile, cell: MazeCellRef) -> bool {
    puzzle
        .open
        .get(cell.row as usize)
        .and_then(|row| row.get(cell.col as usize))
        .copied()
        .unwrap_or(false)
}

pub fn walls_at(puzzle: &MazeFile, cell: MazeCellRef) -> MazeWalls {
    puzzle
        .walls
        .get(cell.row as usize)
        .and_then(|row| row.get(cell.col as usize))
        .copied()
        .unwrap_or_else(MazeWalls::all)
}

pub fn passage_open(puzzle: &MazeFile, from: MazeCellRef, direction: MazeDirection) -> bool {
    let (dr, dc) = direction.delta();
    let to = MazeCellRef {
        row: from.row + dr,
        col: from.col + dc,
    };
    let size = puzzle.rows;
    if !in_bounds(from, size) || !in_bounds(to, size) {
        return false;
    }
    if !cell_open(puzzle, from) || !cell_open(puzzle, to) {
        return false;
    }
    !walls_at(puzzle, from).blocked(direction) && !walls_at(puzzle, to).blocked(direction.opposite())
}

fn target_reachable(puzzle: &MazeFile) -> bool {
    let mut stack = vec![puzzle.start];
    let mut seen = vec![puzzle.start];
    while let Some(cell) = stack.pop() {
        if cell == puzzle.target {
            return true;
        }
        for direction in [MazeDirection::N, MazeDirection::E, MazeDirection::S, MazeDirection::W] {
            if !passage_open(puzzle, cell, direction) {
                continue;
            }
            let (dr, dc) = direction.delta();
            let next = MazeCellRef {
                row: cell.row + dr,
                col: cell.col + dc,
            };
            if seen.contains(&next) {
                continue;
            }
            seen.push(next);
            stack.push(next);
        }
    }
    false
}

/// A short solvable maze: one step east is the target, and south of the start is a dead end.
pub fn step_maze(difficulty: MazeDifficulty, id: &str, title: &str) -> MazeFile {
    let size = difficulty.size();
    let mut open = vec![vec![true; size as usize]; size as usize];
    let mut walls = vec![vec![MazeWalls::all(); size as usize]; size as usize];
    let start = MazeCellRef { row: 0, col: 0 };
    let target = MazeCellRef { row: 0, col: 1 };
    let dead = MazeCellRef { row: 1, col: 0 };
    walls[0][0].set(MazeDirection::E, false);
    walls[0][1].set(MazeDirection::W, false);
    walls[0][0].set(MazeDirection::S, false);
    walls[1][0].set(MazeDirection::N, false);
    open[0][0] = true;
    open[0][1] = true;
    open[1][0] = true;
    let _ = (start, dead);
    MazeFile {
        id: id.to_string(),
        title: title.to_string(),
        rows: size,
        cols: size,
        start,
        target,
        open,
        walls,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_levels_and_adds_hearts_only_on_a_win() {
        assert_eq!(maze_campaign_score(0, 3, MazePhase::Playing), 0);
        assert_eq!(maze_campaign_score(1, 3, MazePhase::Playing), 200);
        assert_eq!(maze_campaign_score(2, 2, MazePhase::Splash), 500);
        assert_eq!(maze_campaign_score(1, 0, MazePhase::Lost), 200);
        assert_eq!(maze_campaign_score(3, 3, MazePhase::Won), 1150);
        assert_eq!(maze_campaign_score(3, 1, MazePhase::Won), 1050);
    }

    #[test]
    fn accepts_a_step_maze_and_rejects_a_closed_target() {
        let puzzle = step_maze(MazeDifficulty::Easy, "nursery", "Nursery");
        assert!(validate_maze_file(&puzzle, MazeDifficulty::Easy).is_none());
        let mut broken = puzzle.clone();
        broken.open[0][1] = false;
        assert_eq!(
            validate_maze_file(&broken, MazeDifficulty::Easy).as_deref(),
            Some("Target must be an open cell")
        );
    }

    #[test]
    fn rejects_the_wrong_size_and_asymmetric_walls() {
        let puzzle = step_maze(MazeDifficulty::Easy, "nursery", "Nursery");
        assert_eq!(
            validate_maze_file(&puzzle, MazeDifficulty::Medium).as_deref(),
            Some("Medium maze must be 15×15")
        );
        let mut broken = puzzle.clone();
        broken.walls[0][0].e = true;
        assert_eq!(
            validate_maze_file(&broken, MazeDifficulty::Easy).as_deref(),
            Some("Walls at 0,0 are not symmetric")
        );
    }
}
