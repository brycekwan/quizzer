use serde::{Deserialize, Serialize};

pub const MAX_CROSSWORD_CLUES_PER_DIRECTION: usize = 5;
pub const CROSSWORD_POINTS_PER_WORD: i64 = 100;
pub const CROSSWORD_RANK_BONUS_FIRST: i64 = 1000;
pub const CROSSWORD_RANK_BONUS_STEP: i64 = 100;
pub const CROSSWORD_RANK_BONUS_MAX_PLACE: i64 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrosswordDirection {
    Across,
    Down,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordClueDef {
    pub number: i64,
    pub row: i64,
    pub col: i64,
    pub clue: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordPuzzleFile {
    pub id: String,
    pub title: String,
    pub grid: Vec<Vec<Option<String>>>,
    pub across: Vec<CrosswordClueDef>,
    pub down: Vec<CrosswordClueDef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordCellRef {
    pub row: i64,
    pub col: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordWord {
    pub id: String,
    pub number: i64,
    pub direction: CrosswordDirection,
    pub row: i64,
    pub col: i64,
    pub clue: String,
    pub length: i64,
    pub answer: String,
    pub cells: Vec<CrosswordCellRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordCluePublic {
    pub number: i64,
    pub row: i64,
    pub col: i64,
    pub clue: String,
    pub length: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordPublicPuzzle {
    pub id: String,
    pub title: String,
    pub rows: i64,
    pub cols: i64,
    pub open: Vec<Vec<bool>>,
    pub cell_numbers: Vec<Vec<Option<i64>>>,
    pub across: Vec<CrosswordCluePublic>,
    pub down: Vec<CrosswordCluePublic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordPlayerSnapshot {
    pub puzzle: CrosswordPublicPuzzle,
    pub letters: Vec<Vec<Option<String>>>,
    pub correct_word_ids: Vec<String>,
    pub completed: bool,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
    pub total_words: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordPuzzleInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordAdminEntry {
    pub player_id: String,
    pub name: String,
    pub correct_word_count: i64,
    pub total_words: i64,
    pub score: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrosswordAdminSnapshot {
    pub puzzle_id: String,
    pub title: String,
    pub pending_puzzle_id: String,
    pub puzzles: Vec<CrosswordPuzzleInfo>,
    pub total_words: i64,
    pub players: Vec<CrosswordAdminEntry>,
}

pub fn crossword_word_points(correct_word_count: i64) -> i64 {
    correct_word_count.max(0) * CROSSWORD_POINTS_PER_WORD
}

pub fn crossword_rank_bonus(rank: i64) -> i64 {
    if !(1..=CROSSWORD_RANK_BONUS_MAX_PLACE).contains(&rank) {
        return 0;
    }
    CROSSWORD_RANK_BONUS_FIRST - (rank - 1) * CROSSWORD_RANK_BONUS_STEP
}

pub fn crossword_score(correct_word_count: i64, rank: i64) -> i64 {
    crossword_word_points(correct_word_count) + crossword_rank_bonus(rank)
}

fn walk_answer(
    grid: &[Vec<Option<String>>],
    row: i64,
    col: i64,
    direction: CrosswordDirection,
) -> Result<(String, Vec<CrosswordCellRef>), String> {
    let rows = grid.len() as i64;
    let cols = grid.first().map(|row| row.len()).unwrap_or(0) as i64;
    if row < 0 || col < 0 || row >= rows || col >= cols {
        return Err("Clue start is out of bounds".into());
    }
    if grid[row as usize][col as usize].is_none() {
        return Err("Clue start is on a block".into());
    }

    let mut cells = Vec::new();
    let mut answer = String::new();
    let mut r = row;
    let mut c = col;
    while r < rows && c < cols && grid[r as usize][c as usize].is_some() {
        let letter = grid[r as usize][c as usize].as_deref().unwrap_or("");
        if letter.chars().count() != 1 || !letter.chars().all(|ch| ch.is_ascii_alphabetic()) {
            return Err(format!("Invalid grid letter at {r},{c}"));
        }
        answer.push_str(&letter.to_uppercase());
        cells.push(CrosswordCellRef { row: r, col: c });
        if direction == CrosswordDirection::Across {
            c += 1;
        } else {
            r += 1;
        }
    }

    if cells.len() < 2 {
        return Err("Words must be at least 2 letters".into());
    }
    Ok((answer, cells))
}

fn derive_direction(
    grid: &[Vec<Option<String>>],
    clues: &[CrosswordClueDef],
    direction: CrosswordDirection,
) -> Result<Vec<CrosswordWord>, String> {
    let mut words = Vec::new();
    let mut seen = Vec::new();
    for clue in clues {
        if seen.contains(&clue.number) {
            return Err(format!(
                "Duplicate {} clue number {}",
                direction_name(direction),
                clue.number
            ));
        }
        seen.push(clue.number);
        let (answer, cells) = walk_answer(grid, clue.row, clue.col, direction).map_err(|error| {
            format!("{} {}: {error}", direction_name(direction), clue.number)
        })?;
        words.push(CrosswordWord {
            id: format!("{}-{}", direction_name(direction), clue.number),
            number: clue.number,
            direction,
            row: clue.row,
            col: clue.col,
            clue: clue.clue.trim().to_string(),
            length: answer.len() as i64,
            answer,
            cells,
        });
    }
    Ok(words)
}

fn direction_name(direction: CrosswordDirection) -> &'static str {
    match direction {
        CrosswordDirection::Across => "across",
        CrosswordDirection::Down => "down",
    }
}

pub fn derive_crossword_words(puzzle: &CrosswordPuzzleFile) -> Result<Vec<CrosswordWord>, String> {
    let across = derive_direction(&puzzle.grid, &puzzle.across, CrosswordDirection::Across)?;
    let down = derive_direction(&puzzle.grid, &puzzle.down, CrosswordDirection::Down)?;
    Ok(across.into_iter().chain(down).collect())
}

pub fn validate_crossword_file(puzzle: &CrosswordPuzzleFile) -> Option<String> {
    if puzzle.id.trim().is_empty() {
        return Some("Crossword id is required".into());
    }
    if puzzle.title.trim().is_empty() {
        return Some("Crossword title is required".into());
    }
    if puzzle.grid.is_empty() {
        return Some("Crossword grid is required".into());
    }
    let cols = puzzle.grid.first().map(|row| row.len()).unwrap_or(0);
    if cols == 0 {
        return Some("Crossword grid has no columns".into());
    }
    for (row_index, row) in puzzle.grid.iter().enumerate() {
        if row.len() != cols {
            return Some(format!("Grid row {row_index} has inconsistent length"));
        }
    }
    if puzzle.across.is_empty() || puzzle.down.is_empty() {
        return Some("Crossword needs at least one across and one down clue".into());
    }
    if puzzle.across.len() > MAX_CROSSWORD_CLUES_PER_DIRECTION {
        return Some(format!(
            "At most {MAX_CROSSWORD_CLUES_PER_DIRECTION} across clues"
        ));
    }
    if puzzle.down.len() > MAX_CROSSWORD_CLUES_PER_DIRECTION {
        return Some(format!(
            "At most {MAX_CROSSWORD_CLUES_PER_DIRECTION} down clues"
        ));
    }
    for clue in puzzle.across.iter().chain(puzzle.down.iter()) {
        if clue.number < 1 {
            return Some("Clue numbers must be positive integers".into());
        }
        if clue.clue.trim().is_empty() {
            return Some(format!("Clue {} is missing text", clue.number));
        }
    }
    let words = match derive_crossword_words(puzzle) {
        Ok(words) => words,
        Err(error) => return Some(error),
    };
    validate_maximal_runs(&puzzle.grid, &words)
}

fn word_key(word: &CrosswordWord) -> String {
    format!(
        "{}:{}:{}:{}",
        direction_name(word.direction),
        word.row,
        word.col,
        word.length
    )
}

fn validate_maximal_runs(grid: &[Vec<Option<String>>], words: &[CrosswordWord]) -> Option<String> {
    let rows = grid.len();
    let cols = grid.first().map(|row| row.len()).unwrap_or(0);
    let covered: Vec<String> = words.iter().map(word_key).collect();

    for (r, row) in grid.iter().enumerate() {
        let mut c = 0;
        while c < cols {
            if row[c].is_none() {
                c += 1;
                continue;
            }
            let start = c;
            while c < cols && row[c].is_some() {
                c += 1;
            }
            let length = c - start;
            if length >= 2 {
                let key = format!("across:{r}:{start}:{length}");
                if !covered.iter().any(|existing| existing == &key) {
                    return Some(format!(
                        "Open across run at ({r},{start}) length {length} has no clue (words must be separated by blocks)"
                    ));
                }
            }
        }
    }

    for c in 0..cols {
        let mut r = 0;
        while r < rows {
            if grid[r][c].is_none() {
                r += 1;
                continue;
            }
            let start = r;
            while r < rows && grid[r][c].is_some() {
                r += 1;
            }
            let length = r - start;
            if length >= 2 {
                let key = format!("down:{start}:{c}:{length}");
                if !covered.iter().any(|existing| existing == &key) {
                    return Some(format!(
                        "Open down run at ({start},{c}) length {length} has no clue (words must be separated by blocks)"
                    ));
                }
            }
        }
    }
    None
}

fn to_clue_public(word: &CrosswordWord) -> CrosswordCluePublic {
    CrosswordCluePublic {
        number: word.number,
        row: word.row,
        col: word.col,
        clue: word.clue.clone(),
        length: word.length,
    }
}

pub fn to_public_crossword_puzzle(
    puzzle: &CrosswordPuzzleFile,
    words: &[CrosswordWord],
) -> CrosswordPublicPuzzle {
    let rows = puzzle.grid.len();
    let cols = puzzle.grid.first().map(|row| row.len()).unwrap_or(0);
    let open = puzzle
        .grid
        .iter()
        .map(|row| row.iter().map(|cell| cell.is_some()).collect())
        .collect();
    let mut cell_numbers = vec![vec![None; cols]; rows];
    for word in words {
        let existing = cell_numbers[word.row as usize][word.col as usize];
        if existing.is_none() || existing.is_some_and(|value| word.number < value) {
            cell_numbers[word.row as usize][word.col as usize] = Some(word.number);
        }
    }
    CrosswordPublicPuzzle {
        id: puzzle.id.clone(),
        title: puzzle.title.clone(),
        rows: rows as i64,
        cols: cols as i64,
        open,
        cell_numbers,
        across: words
            .iter()
            .filter(|word| word.direction == CrosswordDirection::Across)
            .map(to_clue_public)
            .collect(),
        down: words
            .iter()
            .filter(|word| word.direction == CrosswordDirection::Down)
            .map(to_clue_public)
            .collect(),
    }
}

pub fn words_covering_cell(words: &[CrosswordWord], row: i64, col: i64) -> Vec<CrosswordWord> {
    words
        .iter()
        .filter(|word| word.cells.iter().any(|cell| cell.row == row && cell.col == col))
        .cloned()
        .collect()
}

pub fn empty_letter_grid(puzzle: &CrosswordPuzzleFile) -> Vec<Vec<Option<String>>> {
    puzzle
        .grid
        .iter()
        .map(|row| {
            row.iter()
                .map(|cell| if cell.is_none() { None } else { Some(String::new()) })
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn mini() -> CrosswordPuzzleFile {
        CrosswordPuzzleFile {
            id: "foods-mini".into(),
            title: "Foods Mini".into(),
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

    #[test]
    fn scoring_matches_word_and_rank_bonus() {
        assert_eq!(crossword_word_points(0), 0);
        assert_eq!(crossword_word_points(3), 300);
        assert_eq!(crossword_rank_bonus(1), 1000);
        assert_eq!(crossword_rank_bonus(2), 900);
        assert_eq!(crossword_rank_bonus(10), 100);
        assert_eq!(crossword_rank_bonus(11), 0);
        assert_eq!(crossword_rank_bonus(0), 0);
        assert_eq!(crossword_score(2, 1), 1200);
        assert_eq!(crossword_score(0, 3), 800);
    }

    #[test]
    fn accepts_consistent_mini_puzzle() {
        let puzzle = mini();
        assert!(validate_crossword_file(&puzzle).is_none());
        let words = derive_crossword_words(&puzzle).unwrap();
        assert_eq!(words.len(), 2);
        assert_eq!(
            words
                .iter()
                .find(|word| word.direction == CrosswordDirection::Across)
                .unwrap()
                .answer,
            "PIE"
        );
        assert_eq!(
            words
                .iter()
                .find(|word| word.direction == CrosswordDirection::Down)
                .unwrap()
                .answer,
            "PAN"
        );
    }

    #[test]
    fn rejects_more_than_five_across() {
        let mut puzzle = mini();
        puzzle.across = (1..=6)
            .map(|number| CrosswordClueDef {
                number,
                row: 0,
                col: 0,
                clue: format!("Clue {number}"),
            })
            .collect();
        let error = validate_crossword_file(&puzzle).unwrap();
        assert!(error.contains("At most 5 across"));
    }

    #[test]
    fn rejects_uncovered_run() {
        let puzzle = CrosswordPuzzleFile {
            id: "orphan-run".into(),
            title: "Orphan run".into(),
            grid: vec![
                vec![
                    Some("A".into()),
                    Some("B".into()),
                    None,
                    Some("C".into()),
                    Some("D".into()),
                ],
                vec![Some("E".into()), None, None, None, None],
            ],
            across: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "AB only".into(),
            }],
            down: vec![CrosswordClueDef {
                number: 1,
                row: 0,
                col: 0,
                clue: "AE".into(),
            }],
        };
        let error = validate_crossword_file(&puzzle).unwrap();
        assert!(error.to_lowercase().contains("no clue"));
    }

    #[test]
    fn public_puzzle_omits_answers() {
        let puzzle = mini();
        let words = derive_crossword_words(&puzzle).unwrap();
        let public_puzzle = to_public_crossword_puzzle(&puzzle, &words);
        assert!(public_puzzle.open[0][0]);
        assert!(!public_puzzle.open[1][1]);
        assert_eq!(public_puzzle.cell_numbers[0][0], Some(1));
        let json = serde_json::to_value(&public_puzzle.across[0]).unwrap();
        assert!(json.get("answer").is_none());
    }

    #[test]
    fn accepts_foods_pack() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../apps/server/crossword/puzzles/foods.json");
        let puzzle: CrosswordPuzzleFile =
            serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert!(validate_crossword_file(&puzzle).is_none());
        let words = derive_crossword_words(&puzzle).unwrap();
        let answer = |id: &str| {
            words
                .iter()
                .find(|word| word.id == id)
                .unwrap()
                .answer
                .as_str()
        };
        assert_eq!(answer("across-1"), "BASIL");
        assert_eq!(answer("across-3"), "GELATO");
        assert_eq!(answer("across-5"), "ALMOND");
        assert_eq!(answer("across-7"), "TACO");
        assert_eq!(answer("across-8"), "LYCHEE");
        assert_eq!(answer("down-1"), "BAGEL");
        assert_eq!(answer("down-2"), "SALMON");
        assert_eq!(answer("down-4"), "CARROT");
        assert_eq!(answer("down-5"), "APPLE");
        assert_eq!(answer("down-6"), "DATE");
    }
}
