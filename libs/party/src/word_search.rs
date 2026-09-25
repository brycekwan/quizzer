use serde::{Deserialize, Serialize};

pub const WORD_SEARCH_SIZE: usize = 12;
pub const WORD_SEARCH_WORD_COUNT: usize = 10;
pub const WORD_SEARCH_POINTS_PER_WORD: i64 = 100;
pub const WORD_SEARCH_RANK_BONUS_FIRST: i64 = 1000;
pub const WORD_SEARCH_RANK_BONUS_STEP: i64 = 100;
pub const WORD_SEARCH_RANK_BONUS_MAX_PLACE: i64 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WordSearchDirection {
    E,
    W,
    N,
    S,
    NE,
    NW,
    SE,
    SW,
}

impl WordSearchDirection {
    pub fn delta(self) -> (i64, i64) {
        match self {
            Self::E => (0, 1),
            Self::W => (0, -1),
            Self::N => (-1, 0),
            Self::S => (1, 0),
            Self::NE => (-1, 1),
            Self::NW => (-1, -1),
            Self::SE => (1, 1),
            Self::SW => (1, -1),
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "E" => Some(Self::E),
            "W" => Some(Self::W),
            "N" => Some(Self::N),
            "S" => Some(Self::S),
            "NE" => Some(Self::NE),
            "NW" => Some(Self::NW),
            "SE" => Some(Self::SE),
            "SW" => Some(Self::SW),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchCellRef {
    pub row: i64,
    pub col: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchPlacement {
    pub word: String,
    pub row: i64,
    pub col: i64,
    pub direction: WordSearchDirection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchFile {
    pub id: String,
    pub title: String,
    pub grid: Vec<Vec<String>>,
    pub words: Vec<WordSearchPlacement>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchWord {
    pub id: String,
    pub word: String,
    pub row: i64,
    pub col: i64,
    pub direction: WordSearchDirection,
    pub cells: Vec<WordSearchCellRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchPublicPuzzle {
    pub id: String,
    pub title: String,
    pub rows: i64,
    pub cols: i64,
    pub grid: Vec<Vec<String>>,
    pub words: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchFoundWord {
    pub id: String,
    pub word: String,
    pub cells: Vec<WordSearchCellRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchPlayerSnapshot {
    pub puzzle: WordSearchPublicPuzzle,
    pub found: Vec<WordSearchFoundWord>,
    pub completed: bool,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
    pub total_words: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchPuzzleInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchAdminEntry {
    pub player_id: String,
    pub name: String,
    pub found_count: i64,
    pub total_words: i64,
    pub score: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSearchAdminSnapshot {
    pub puzzle_id: String,
    pub title: String,
    pub pending_puzzle_id: String,
    pub puzzles: Vec<WordSearchPuzzleInfo>,
    pub total_words: i64,
    pub players: Vec<WordSearchAdminEntry>,
}

pub fn word_search_word_points(found_count: i64) -> i64 {
    found_count.max(0) * WORD_SEARCH_POINTS_PER_WORD
}

pub fn word_search_rank_bonus(rank: i64) -> i64 {
    if !(1..=WORD_SEARCH_RANK_BONUS_MAX_PLACE).contains(&rank) {
        return 0;
    }
    WORD_SEARCH_RANK_BONUS_FIRST - (rank - 1) * WORD_SEARCH_RANK_BONUS_STEP
}

pub fn word_search_score(found_count: i64, rank: i64) -> i64 {
    word_search_word_points(found_count) + word_search_rank_bonus(rank)
}

pub fn cells_for_placement(
    word: &str,
    row: i64,
    col: i64,
    direction: WordSearchDirection,
    rows: i64,
    cols: i64,
) -> Result<Vec<WordSearchCellRef>, String> {
    let letters = word.trim().to_uppercase();
    if letters.len() < 2 || !letters.chars().all(|ch| ch.is_ascii_uppercase()) {
        return Err(format!("Invalid word \"{word}\""));
    }
    let (dr, dc) = direction.delta();
    let mut cells = Vec::new();
    for index in 0..letters.len() as i64 {
        let r = row + dr * index;
        let c = col + dc * index;
        if r < 0 || c < 0 || r >= rows || c >= cols {
            return Err(format!("\"{letters}\" runs off the grid"));
        }
        cells.push(WordSearchCellRef { row: r, col: c });
    }
    Ok(cells)
}

fn same_cell(a: &WordSearchCellRef, b: &WordSearchCellRef) -> bool {
    a.row == b.row && a.col == b.col
}

pub fn selection_matches_word(cells: &[WordSearchCellRef], word: &WordSearchWord) -> bool {
    if cells.len() != word.cells.len() || cells.is_empty() {
        return false;
    }
    let forward = cells
        .iter()
        .zip(word.cells.iter())
        .all(|(cell, expected)| same_cell(cell, expected));
    if forward {
        return true;
    }
    cells.iter().enumerate().all(|(index, cell)| {
        same_cell(cell, &word.cells[word.cells.len() - 1 - index])
    })
}

pub fn derive_word_search_words(puzzle: &WordSearchFile) -> Result<Vec<WordSearchWord>, String> {
    let rows = puzzle.grid.len() as i64;
    let cols = puzzle.grid.first().map(|row| row.len()).unwrap_or(0) as i64;
    let mut words = Vec::new();
    let mut seen = Vec::new();
    for placement in &puzzle.words {
        let word = placement.word.trim().to_uppercase();
        if seen.iter().any(|existing: &String| existing == &word) {
            return Err(format!("Duplicate word {word}"));
        }
        let cells = cells_for_placement(&word, placement.row, placement.col, placement.direction, rows, cols)?;
        for (index, cell) in cells.iter().enumerate() {
            let letter = puzzle
                .grid
                .get(cell.row as usize)
                .and_then(|row| row.get(cell.col as usize))
                .map(|letter| letter.to_uppercase())
                .unwrap_or_default();
            if letter != word.chars().nth(index).unwrap().to_string() {
                return Err(format!(
                    "{word} does not match the grid at ({},{})",
                    cell.row, cell.col
                ));
            }
        }
        seen.push(word.clone());
        words.push(WordSearchWord {
            id: word.clone(),
            word,
            row: placement.row,
            col: placement.col,
            direction: placement.direction,
            cells,
        });
    }
    Ok(words)
}

pub fn to_public_word_search(puzzle: &WordSearchFile, words: &[WordSearchWord]) -> WordSearchPublicPuzzle {
    WordSearchPublicPuzzle {
        id: puzzle.id.clone(),
        title: puzzle.title.clone(),
        rows: puzzle.grid.len() as i64,
        cols: puzzle.grid.first().map(|row| row.len()).unwrap_or(0) as i64,
        grid: puzzle
            .grid
            .iter()
            .map(|row| row.iter().map(|letter| letter.to_uppercase()).collect())
            .collect(),
        words: words.iter().map(|word| word.word.clone()).collect(),
    }
}

pub fn validate_word_search_file(puzzle: &WordSearchFile) -> Option<String> {
    if puzzle.id.trim().is_empty() {
        return Some("Word search id is required".into());
    }
    if puzzle.title.trim().is_empty() {
        return Some("Word search title is required".into());
    }
    if puzzle.grid.len() != WORD_SEARCH_SIZE {
        return Some(format!(
            "Word search grid must be {WORD_SEARCH_SIZE}×{WORD_SEARCH_SIZE}"
        ));
    }
    for (row_index, row) in puzzle.grid.iter().enumerate() {
        if row.len() != WORD_SEARCH_SIZE {
            return Some(format!("Grid row {row_index} must have {WORD_SEARCH_SIZE} letters"));
        }
        for (col_index, letter) in row.iter().enumerate() {
            if letter.chars().count() != 1 || !letter.chars().all(|ch| ch.is_ascii_alphabetic()) {
                return Some(format!("Invalid grid letter at {row_index},{col_index}"));
            }
        }
    }
    if puzzle.words.len() != WORD_SEARCH_WORD_COUNT {
        return Some(format!(
            "Word search needs exactly {WORD_SEARCH_WORD_COUNT} words"
        ));
    }
    derive_word_search_words(puzzle).err()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placements() -> Vec<WordSearchPlacement> {
        vec![
            placement("OTTAWA", 0, 0, WordSearchDirection::E),
            placement("HOCKEY", 0, 6, WordSearchDirection::S),
            placement("MOOSE", 1, 7, WordSearchDirection::E),
            placement("BEAVER", 3, 0, WordSearchDirection::E),
            placement("TORONTO", 6, 0, WordSearchDirection::E),
            placement("QUEBEC", 7, 0, WordSearchDirection::E),
            placement("NIAGARA", 8, 0, WordSearchDirection::E),
            placement("POUTINE", 9, 0, WordSearchDirection::E),
            placement("CALGARY", 10, 0, WordSearchDirection::E),
            placement("MAPLE", 11, 11, WordSearchDirection::N),
        ]
    }

    fn placement(word: &str, row: i64, col: i64, direction: WordSearchDirection) -> WordSearchPlacement {
        WordSearchPlacement {
            word: word.into(),
            row,
            col,
            direction,
        }
    }

    fn sample_puzzle() -> WordSearchFile {
        let mut grid = vec![vec!["X".to_string(); WORD_SEARCH_SIZE]; WORD_SEARCH_SIZE];
        for placement in placements() {
            let (dr, dc) = placement.direction.delta();
            for (index, letter) in placement.word.chars().enumerate() {
                let row = (placement.row + dr * index as i64) as usize;
                let col = (placement.col + dc * index as i64) as usize;
                grid[row][col] = letter.to_string();
            }
        }
        WordSearchFile {
            id: "canada".into(),
            title: "Canada".into(),
            grid,
            words: placements(),
        }
    }

    #[test]
    fn scoring() {
        assert_eq!(word_search_word_points(0), 0);
        assert_eq!(word_search_word_points(10), 1000);
        assert_eq!(word_search_rank_bonus(1), 1000);
        assert_eq!(word_search_rank_bonus(2), 900);
        assert_eq!(word_search_rank_bonus(10), 100);
        assert_eq!(word_search_rank_bonus(11), 0);
        assert_eq!(word_search_rank_bonus(0), 0);
        assert_eq!(word_search_score(10, 1), 2000);
        assert_eq!(word_search_score(10, 10), 1100);
        assert_eq!(word_search_score(10, 11), 1000);
        assert_eq!(word_search_score(2, 3), 1000);
    }

    #[test]
    fn accepts_matching_12_grid() {
        let puzzle = sample_puzzle();
        assert!(validate_word_search_file(&puzzle).is_none());
        let words = derive_word_search_words(&puzzle).unwrap();
        assert_eq!(words.len(), WORD_SEARCH_WORD_COUNT);
    }

    #[test]
    fn rejects_wrong_grid_size() {
        let mut puzzle = sample_puzzle();
        puzzle.grid.truncate(10);
        let error = validate_word_search_file(&puzzle).unwrap();
        assert!(error.contains("12×12"));
    }

    #[test]
    fn rejects_mismatched_placement() {
        let mut puzzle = sample_puzzle();
        puzzle.grid[0][0] = "Z".into();
        let error = validate_word_search_file(&puzzle).unwrap();
        assert!(error.contains("OTTAWA"));
    }

    #[test]
    fn rejects_duplicate_words() {
        let mut puzzle = sample_puzzle();
        puzzle.words[1] = placement("OTTAWA", 10, 0, WordSearchDirection::E);
        for (index, letter) in "OTTAWA".chars().enumerate() {
            puzzle.grid[10][index] = letter.to_string();
        }
        let error = validate_word_search_file(&puzzle).unwrap();
        assert!(error.contains("Duplicate"));
    }

    #[test]
    fn matches_forward_and_reversed() {
        let words = derive_word_search_words(&sample_puzzle()).unwrap();
        let ottawa = &words[0];
        assert!(selection_matches_word(&ottawa.cells, ottawa));
        let mut reversed = ottawa.cells.clone();
        reversed.reverse();
        assert!(selection_matches_word(&reversed, ottawa));
        assert!(!selection_matches_word(&ottawa.cells[..3], ottawa));
    }
}
