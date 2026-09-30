use serde::{Deserialize, Serialize};

pub const WORD_LENGTHS: [i64; 5] = [5, 6, 7, 8, 9];
pub const WORDS_PER_LENGTH: usize = 5;
pub const WORD_COUNT: i64 = (WORD_LENGTHS.len() * WORDS_PER_LENGTH) as i64;
pub const MAX_GUESSES: i64 = 5;
pub const POINTS_PER_WORD: i64 = 100;
pub const POINTS_PER_UNUSED_GUESS: i64 = 5;
pub const DEFAULT_SPLASH_MS: i64 = 3_000;
pub const REVEAL_MS: i64 = 2_000;
pub const TOPIC_MAX_CHARS: usize = 40;
pub const MIN_SPLASH_MS: i64 = 1_000;
pub const MAX_SPLASH_MS: i64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WordSurvivorPhase {
    Intro,
    Playing,
    /// The correct word stays green before the splash.
    Reveal,
    Splash,
    Won,
    Lost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TileMark {
    Correct,
    Present,
    Absent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSurvivorGuess {
    pub word: String,
    pub marks: Vec<TileMark>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordSurvivorFile {
    #[serde(rename = "5")]
    pub len5: Vec<String>,
    #[serde(rename = "6")]
    pub len6: Vec<String>,
    #[serde(rename = "7")]
    pub len7: Vec<String>,
    #[serde(rename = "8")]
    pub len8: Vec<String>,
    #[serde(rename = "9")]
    pub len9: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WordLists {
    buckets: [Vec<String>; 5],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordLengthCount {
    pub length: i64,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSurvivorPlayerSnapshot {
    pub word_number: i64,
    pub word_count: i64,
    pub length: i64,
    pub guesses: Vec<WordSurvivorGuess>,
    pub draft: String,
    pub score: i64,
    pub phase: WordSurvivorPhase,
    pub topic: String,
    pub splash_until: Option<i64>,
    pub reveal_until: Option<i64>,
    pub words_cleared: i64,
    pub max_guesses: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
    /// Set after a loss so the game-over screen can show the word.
    pub answer: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSurvivorAdminEntry {
    pub player_id: String,
    pub name: String,
    pub score: i64,
    pub word_number: i64,
    pub length: i64,
    pub phase: WordSurvivorPhase,
    pub words_cleared: i64,
    pub elapsed_ms: i64,
    pub active_since: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSurvivorFileInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSurvivorAdminSnapshot {
    pub splash_ms: i64,
    pub file_id: String,
    pub topic: String,
    pub files: Vec<WordSurvivorFileInfo>,
    pub counts: Vec<WordLengthCount>,
    pub load_error: Option<String>,
    pub players: Vec<WordSurvivorAdminEntry>,
}

impl WordLists {
    pub fn from_file(file: WordSurvivorFile) -> Result<Self, String> {
        if let Some(error) = validate_word_survivor_file(&file) {
            return Err(error);
        }
        Ok(Self {
            buckets: [
                normalize(&file.len5),
                normalize(&file.len6),
                normalize(&file.len7),
                normalize(&file.len8),
                normalize(&file.len9),
            ],
        })
    }

    pub fn words(&self, length: i64) -> &[String] {
        &self.buckets[bucket_index(length)]
    }

    pub fn counts(&self) -> Vec<WordLengthCount> {
        WORD_LENGTHS
            .iter()
            .map(|length| WordLengthCount {
                length: *length,
                count: self.words(*length).len() as i64,
            })
            .collect()
    }
}

pub fn validate_word_survivor_file(file: &WordSurvivorFile) -> Option<String> {
    for (length, words) in [
        (5, &file.len5),
        (6, &file.len6),
        (7, &file.len7),
        (8, &file.len8),
        (9, &file.len9),
    ] {
        if let Some(error) = validate_bucket(length, words) {
            return Some(error);
        }
    }
    None
}

fn validate_bucket(length: i64, words: &[String]) -> Option<String> {
    if words.len() < WORDS_PER_LENGTH {
        return Some(format!(
            "Need at least 25 words, including at least {WORDS_PER_LENGTH} words of {length} letters"
        ));
    }
    let mut seen = Vec::new();
    for word in words {
        let normalized = normalize_word(word);
        if normalized.chars().count() != length as usize
            || !normalized.chars().all(|ch| ch.is_ascii_uppercase())
        {
            return Some(format!("\"{word}\" must be {length} letters A–Z"));
        }
        if seen.iter().any(|existing: &String| existing == &normalized) {
            return Some(format!("\"{normalized}\" is listed more than once"));
        }
        seen.push(normalized);
    }
    None
}

fn normalize(words: &[String]) -> Vec<String> {
    words.iter().map(|word| normalize_word(word)).collect()
}

fn normalize_word(word: &str) -> String {
    word.trim().to_ascii_uppercase()
}

fn bucket_index(length: i64) -> usize {
    WORD_LENGTHS
        .iter()
        .position(|candidate| *candidate == length)
        .unwrap_or(0)
}

pub fn length_at(index: usize) -> i64 {
    WORD_LENGTHS[index / WORDS_PER_LENGTH]
}

/// 100 for the word, plus 5 for each guess that was not needed.
pub fn score_word(guesses_used: i64) -> i64 {
    let unused = (MAX_GUESSES - guesses_used).max(0);
    POINTS_PER_WORD + unused * POINTS_PER_UNUSED_GUESS
}

/// Wordle-style marks. Greens are claimed first, then leftover letters turn yellow.
pub fn mark_guess(guess: &str, answer: &str) -> Vec<TileMark> {
    let guess: Vec<char> = guess.chars().collect();
    let answer: Vec<char> = answer.chars().collect();
    let mut marks = vec![TileMark::Absent; guess.len()];
    let mut remaining = answer.clone();
    for index in 0..guess.len() {
        if answer.get(index).copied() == Some(guess[index]) {
            marks[index] = TileMark::Correct;
            remaining[index] = '\0';
        }
    }
    for index in 0..guess.len() {
        if marks[index] == TileMark::Correct {
            continue;
        }
        if let Some(found) = remaining.iter().position(|letter| *letter == guess[index]) {
            marks[index] = TileMark::Present;
            remaining[found] = '\0';
        }
    }
    marks
}

/// Enough distinct words for a full run, in file order within each length.
pub fn sample_word_lists() -> WordLists {
    fn bucket(length: usize) -> Vec<String> {
        (0..6)
            .map(|offset| {
                (0..length)
                    .map(|index| (b'A' + ((offset + index) % 26) as u8) as char)
                    .collect()
            })
            .collect()
    }
    WordLists {
        buckets: [bucket(5), bucket(6), bucket(7), bucket(8), bucket(9)],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file() -> WordSurvivorFile {
        let lists = sample_word_lists();
        WordSurvivorFile {
            len5: lists.words(5).to_vec(),
            len6: lists.words(6).to_vec(),
            len7: lists.words(7).to_vec(),
            len8: lists.words(8).to_vec(),
            len9: lists.words(9).to_vec(),
        }
    }

    #[test]
    fn scores_unused_guesses() {
        assert_eq!(score_word(1), 120);
        assert_eq!(score_word(5), 100);
        assert_eq!(WORD_COUNT, 25);
        assert_eq!(length_at(0), 5);
        assert_eq!(length_at(4), 5);
        assert_eq!(length_at(5), 6);
        assert_eq!(length_at(24), 9);
    }

    #[test]
    fn marks_greens_before_yellows() {
        assert_eq!(
            mark_guess("ERROR", "CRANE"),
            vec![
                TileMark::Present,
                TileMark::Correct,
                TileMark::Absent,
                TileMark::Absent,
                TileMark::Absent,
            ]
        );
        assert_eq!(
            mark_guess("EEEEE", "EERIE"),
            vec![
                TileMark::Correct,
                TileMark::Correct,
                TileMark::Absent,
                TileMark::Absent,
                TileMark::Correct,
            ]
        );
    }

    #[test]
    fn accepts_a_full_file_and_rejects_short_or_duplicate_buckets() {
        assert!(validate_word_survivor_file(&file()).is_none());
        let mut short = file();
        short.len6.truncate(4);
        assert_eq!(
            validate_word_survivor_file(&short).as_deref(),
            Some("Need at least 25 words, including at least 5 words of 6 letters")
        );
        let mut duplicated = file();
        duplicated.len5[1] = "abcde".into();
        assert_eq!(
            validate_word_survivor_file(&duplicated).as_deref(),
            Some("\"ABCDE\" is listed more than once")
        );
        let mut letters = file();
        letters.len9[0] = "CHOCOLATE!".into();
        assert_eq!(
            validate_word_survivor_file(&letters).as_deref(),
            Some("\"CHOCOLATE!\" must be 9 letters A–Z")
        );
    }
}
