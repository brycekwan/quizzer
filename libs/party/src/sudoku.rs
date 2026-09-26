use serde::{Deserialize, Serialize};

pub const SUDOKU_SIZE: usize = 9;
pub const SUDOKU_POINTS_PER_CORRECT: i64 = 10;
pub const SUDOKU_POINTS_PER_INCORRECT: i64 = -10;
pub const SUDOKU_COMPLETION_BONUS: i64 = 100;
pub const SUDOKU_HINT_MAX: i64 = 3;
pub const SUDOKU_POINTS_PER_UNUSED_HINT: i64 = 10;
pub const SUDOKU_RANK_BONUS_FIRST: i64 = 1000;
pub const SUDOKU_RANK_BONUS_STEP: i64 = 100;
pub const SUDOKU_RANK_BONUS_MAX_PLACE: i64 = 10;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuFile {
    pub id: String,
    pub title: String,
    pub solution: Vec<Vec<u8>>,
    pub givens: Vec<Vec<Option<u8>>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuPublicPuzzle {
    pub id: String,
    pub title: String,
    pub rows: i64,
    pub cols: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuCellState {
    pub given: bool,
    pub value: Option<u8>,
    pub solved: bool,
    pub hinted: bool,
    pub drafts: Vec<u8>,
    pub wrong_drafts: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuPlayerSnapshot {
    pub puzzle: SudokuPublicPuzzle,
    pub cells: Vec<Vec<SudokuCellState>>,
    pub score: i64,
    pub hints_used: i64,
    pub hints_max: i64,
    pub completed: bool,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuPuzzleInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuAdminEntry {
    pub player_id: String,
    pub name: String,
    pub score: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuAdminSnapshot {
    pub puzzle_id: String,
    pub title: String,
    pub pending_puzzle_id: String,
    pub puzzles: Vec<SudokuPuzzleInfo>,
    pub players: Vec<SudokuAdminEntry>,
}

pub fn sudoku_player_score(correct: i64, incorrect: i64, completed: bool, hints_used: i64) -> i64 {
    let mut score =
        correct.max(0) * SUDOKU_POINTS_PER_CORRECT + incorrect.max(0) * SUDOKU_POINTS_PER_INCORRECT;
    if completed {
        let unused = (SUDOKU_HINT_MAX - hints_used.max(0)).max(0);
        score += SUDOKU_COMPLETION_BONUS + unused * SUDOKU_POINTS_PER_UNUSED_HINT;
    }
    score
}

pub fn sudoku_rank_bonus(rank: i64) -> i64 {
    if !(1..=SUDOKU_RANK_BONUS_MAX_PLACE).contains(&rank) {
        return 0;
    }
    SUDOKU_RANK_BONUS_FIRST - (rank - 1) * SUDOKU_RANK_BONUS_STEP
}

pub fn sudoku_admin_score(player_score: i64, rank: i64) -> i64 {
    player_score + sudoku_rank_bonus(rank)
}

pub fn to_public_sudoku(puzzle: &SudokuFile) -> SudokuPublicPuzzle {
    SudokuPublicPuzzle {
        id: puzzle.id.clone(),
        title: puzzle.title.clone(),
        rows: SUDOKU_SIZE as i64,
        cols: SUDOKU_SIZE as i64,
    }
}

fn digit_ok(value: u8) -> bool {
    (1..=9).contains(&value)
}

fn rules_hold(grid: &[[u8; SUDOKU_SIZE]; SUDOKU_SIZE]) -> bool {
    for row in 0..SUDOKU_SIZE {
        let mut across = [false; 10];
        let mut down = [false; 10];
        for col in 0..SUDOKU_SIZE {
            let row_digit = grid[row][col] as usize;
            let col_digit = grid[col][row] as usize;
            if !(1..=9).contains(&grid[row][col])
                || !(1..=9).contains(&grid[col][row])
                || across[row_digit]
                || down[col_digit]
            {
                return false;
            }
            across[row_digit] = true;
            down[col_digit] = true;
        }
    }
    for box_row in 0..3 {
        for box_col in 0..3 {
            let mut seen = [false; 10];
            for row in 0..3 {
                for col in 0..3 {
                    let value = grid[box_row * 3 + row][box_col * 3 + col] as usize;
                    if seen[value] {
                        return false;
                    }
                    seen[value] = true;
                }
            }
        }
    }
    true
}

fn legal(grid: &[[u8; SUDOKU_SIZE]; SUDOKU_SIZE], row: usize, col: usize, value: u8) -> bool {
    for index in 0..SUDOKU_SIZE {
        if grid[row][index] == value || grid[index][col] == value {
            return false;
        }
    }
    let start_row = row / 3 * 3;
    let start_col = col / 3 * 3;
    for r in start_row..start_row + 3 {
        for c in start_col..start_col + 3 {
            if grid[r][c] == value {
                return false;
            }
        }
    }
    true
}

pub fn sudoku_solution_count(givens: &[[Option<u8>; SUDOKU_SIZE]; SUDOKU_SIZE]) -> usize {
    let mut grid = [[0u8; SUDOKU_SIZE]; SUDOKU_SIZE];
    let mut blanks = Vec::new();
    for row in 0..SUDOKU_SIZE {
        for col in 0..SUDOKU_SIZE {
            match givens[row][col] {
                Some(value) => grid[row][col] = value,
                None => blanks.push((row, col)),
            }
        }
    }
    fn walk(
        grid: &mut [[u8; SUDOKU_SIZE]; SUDOKU_SIZE],
        blanks: &[(usize, usize)],
        index: usize,
        found: &mut usize,
    ) {
        if *found >= 2 {
            return;
        }
        if index == blanks.len() {
            *found += 1;
            return;
        }
        let (row, col) = blanks[index];
        for value in 1..=9 {
            if legal(grid, row, col, value) {
                grid[row][col] = value;
                walk(grid, blanks, index + 1, found);
                grid[row][col] = 0;
                if *found >= 2 {
                    return;
                }
            }
        }
    }
    let mut found = 0;
    walk(&mut grid, &blanks, 0, &mut found);
    found
}

pub fn parsed_grids(
    puzzle: &SudokuFile,
) -> Result<
    (
        [[u8; SUDOKU_SIZE]; SUDOKU_SIZE],
        [[Option<u8>; SUDOKU_SIZE]; SUDOKU_SIZE],
    ),
    String,
> {
    if puzzle.solution.len() != SUDOKU_SIZE || puzzle.givens.len() != SUDOKU_SIZE {
        return Err("Sudoku must be 9×9".into());
    }
    let mut solution = [[0u8; SUDOKU_SIZE]; SUDOKU_SIZE];
    let mut givens = [[None; SUDOKU_SIZE]; SUDOKU_SIZE];
    for row in 0..SUDOKU_SIZE {
        if puzzle.solution[row].len() != SUDOKU_SIZE || puzzle.givens[row].len() != SUDOKU_SIZE {
            return Err("Sudoku must be 9×9".into());
        }
        for col in 0..SUDOKU_SIZE {
            let value = puzzle.solution[row][col];
            if !digit_ok(value) {
                return Err(format!("Solution digit at {row},{col} must be 1-9"));
            }
            solution[row][col] = value;
            match puzzle.givens[row][col] {
                None => givens[row][col] = None,
                Some(given) if given == value => givens[row][col] = Some(given),
                Some(_) => {
                    return Err(format!("Given at {row},{col} does not match the solution"));
                }
            }
        }
    }
    Ok((solution, givens))
}

pub fn validate_sudoku_file(puzzle: &SudokuFile) -> Option<String> {
    if puzzle.id.trim().is_empty() {
        return Some("Sudoku id is required".into());
    }
    if puzzle.title.trim().is_empty() {
        return Some("Sudoku title is required".into());
    }
    let (solution, givens) = match parsed_grids(puzzle) {
        Ok(grids) => grids,
        Err(error) => return Some(error),
    };
    if !rules_hold(&solution) {
        return Some("Solution breaks sudoku rules".into());
    }
    let blanks = givens
        .iter()
        .flatten()
        .filter(|cell| cell.is_none())
        .count();
    if blanks == 0 {
        return Some("Sudoku needs at least one empty cell".into());
    }
    if sudoku_solution_count(&givens) != 1 {
        return Some("Sudoku must have exactly one solution".into());
    }
    None
}

#[cfg(test)]
pub(crate) fn classic_sudoku_file() -> SudokuFile {
    serde_json::from_str(include_str!(
        "../../../apps/server/sudoku/puzzles/sample.json"
    ))
    .expect("sample sudoku")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scoring() {
        assert_eq!(sudoku_player_score(2, 1, false, 0), 10);
        assert_eq!(sudoku_player_score(52, 0, true, 0), 650);
        assert_eq!(sudoku_player_score(51, 0, true, 1), 630);
        assert_eq!(sudoku_player_score(0, 2, false, 0), -20);
        assert_eq!(sudoku_rank_bonus(1), 1000);
        assert_eq!(sudoku_rank_bonus(10), 100);
        assert_eq!(sudoku_rank_bonus(11), 0);
        assert_eq!(sudoku_admin_score(40, 1), 1040);
    }

    #[test]
    fn accepts_the_sample_puzzle() {
        let puzzle = classic_sudoku_file();
        assert!(validate_sudoku_file(&puzzle).is_none());
    }

    #[test]
    fn rejects_a_repeated_solution_digit() {
        let mut puzzle = classic_sudoku_file();
        puzzle.solution[0][0] = puzzle.solution[0][1];
        let error = validate_sudoku_file(&puzzle).unwrap();
        assert!(error.contains("sudoku rules") || error.contains("does not match"));
    }

    #[test]
    fn rejects_a_mismatched_given() {
        let mut puzzle = classic_sudoku_file();
        puzzle.givens[0][2] = Some(1);
        let error = validate_sudoku_file(&puzzle).unwrap();
        assert!(error.contains("does not match"));
    }

    #[test]
    fn rejects_an_ambiguous_board() {
        let mut puzzle = classic_sudoku_file();
        for row in &mut puzzle.givens {
            for cell in row {
                *cell = None;
            }
        }
        let error = validate_sudoku_file(&puzzle).unwrap();
        assert!(error.contains("exactly one solution"));
    }
}
