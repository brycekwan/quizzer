use crate::crossword::{
    derive_crossword_words, validate_crossword_file, CrosswordPuzzleFile, CrosswordPuzzleInfo,
    CrosswordWord,
};
use crate::types::{Question, QuestionSetInfo, QuestionsFile};
use crate::validation::validate_questions_file;
use crate::word_search::{
    derive_word_search_words, validate_word_search_file, WordSearchFile, WordSearchPuzzleInfo,
    WordSearchWord,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn first_existing(candidates: &[PathBuf]) -> PathBuf {
    candidates
        .iter()
        .find(|path| path.is_dir())
        .cloned()
        .unwrap_or_else(|| candidates[0].clone())
}

fn manifest_relative(parts: &[&str]) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../..");
    for part in parts {
        path.push(part);
    }
    path
}

pub fn resolve_questions_dir() -> PathBuf {
    if let Ok(dir) = env::var("QUESTIONS_DIR") {
        return PathBuf::from(dir);
    }
    first_existing(&[
        PathBuf::from("apps/server/questions"),
        PathBuf::from("questions"),
        manifest_relative(&["apps", "server", "questions"]),
    ])
}

pub fn resolve_crossword_dir() -> PathBuf {
    if let Ok(dir) = env::var("CROSSWORD_PUZZLES_DIR") {
        return PathBuf::from(dir);
    }
    first_existing(&[
        PathBuf::from("apps/server/crossword/puzzles"),
        PathBuf::from("crossword/puzzles"),
        manifest_relative(&["apps", "server", "crossword", "puzzles"]),
    ])
}

pub fn resolve_word_search_dir() -> PathBuf {
    if let Ok(dir) = env::var("WORDSEARCH_PUZZLES_DIR") {
        return PathBuf::from(dir);
    }
    first_existing(&[
        PathBuf::from("apps/server/wordsearch/puzzles"),
        PathBuf::from("wordsearch/puzzles"),
        manifest_relative(&["apps", "server", "wordsearch", "puzzles"]),
    ])
}

pub fn label_from_question_set_id(id: &str) -> String {
    id.split(|ch| ch == '-' || ch == '_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut label = first.to_uppercase().to_string();
                    label.push_str(&chars.as_str().to_lowercase());
                    label
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn valid_pack_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_alphanumeric() => {
            chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
        }
        _ => false,
    }
}

fn json_files(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".json"))
        .collect();
    files.sort();
    files
}

pub fn list_question_sets(dir: &Path) -> Vec<QuestionSetInfo> {
    json_files(dir)
        .into_iter()
        .map(|file| {
            let id = file.trim_end_matches(".json").to_string();
            QuestionSetInfo {
                label: label_from_question_set_id(&id),
                id,
            }
        })
        .collect()
}

pub fn load_question_set(id: &str, dir: &Path) -> Result<Vec<Question>, String> {
    if !valid_pack_id(id) {
        return Err("Invalid question set id".into());
    }
    let path = dir.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(format!("Question set \"{id}\" not found"));
    }
    let raw = fs::read_to_string(&path).map_err(|_| format!("Could not read question set \"{id}\""))?;
    let file: QuestionsFile =
        serde_json::from_str(&raw).map_err(|_| format!("Could not read question set \"{id}\""))?;
    if let Some(error) = validate_questions_file(&file) {
        return Err(error);
    }
    Ok(file.questions)
}

pub fn load_question_sets_in_order(ids: &[String], dir: &Path) -> Result<Vec<Question>, String> {
    if ids.is_empty() {
        return Err("At least one question set is required".into());
    }
    let mut questions = Vec::new();
    for id in ids {
        let loaded = load_question_set(id, dir)?;
        for mut question in loaded {
            question.id = format!("{id}:{}", question.id);
            questions.push(question);
        }
    }
    Ok(questions)
}

pub fn load_default_question_set(dir: &Path) -> Result<(String, Vec<Question>), String> {
    let sets = list_question_sets(dir);
    if sets.is_empty() {
        return Err(format!("No question sets found in {}", dir.display()));
    }
    let preferred = sets
        .iter()
        .find(|set| set.id == "dog-facts")
        .unwrap_or(&sets[0]);
    let questions = load_question_sets_in_order(&[preferred.id.clone()], dir)?;
    Ok((preferred.id.clone(), questions))
}

pub fn list_crossword_puzzles(dir: &Path) -> Vec<CrosswordPuzzleInfo> {
    json_files(dir)
        .into_iter()
        .map(|file| CrosswordPuzzleInfo {
            id: file.trim_end_matches(".json").to_string(),
            label: file,
        })
        .collect()
}

pub fn load_crossword_puzzle(
    id: &str,
    dir: &Path,
) -> Result<(CrosswordPuzzleFile, Vec<CrosswordWord>), String> {
    if !valid_pack_id(id) {
        return Err("Invalid crossword id".into());
    }
    let path = dir.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(format!("Crossword \"{id}\" not found"));
    }
    let raw = fs::read_to_string(&path).map_err(|_| format!("Could not read crossword \"{id}\""))?;
    let mut puzzle: CrosswordPuzzleFile =
        serde_json::from_str(&raw).map_err(|_| format!("Could not read crossword \"{id}\""))?;
    if puzzle.id.trim().is_empty() {
        puzzle.id = id.to_string();
    }
    if let Some(error) = validate_crossword_file(&puzzle) {
        return Err(error);
    }
    let words = derive_crossword_words(&puzzle)?;
    Ok((puzzle, words))
}

pub fn load_default_crossword(
    dir: &Path,
) -> Result<(CrosswordPuzzleFile, Vec<CrosswordWord>, Vec<CrosswordPuzzleInfo>), String> {
    let puzzles = list_crossword_puzzles(dir);
    if puzzles.is_empty() {
        return Err(format!("No crossword puzzles found in {}", dir.display()));
    }
    let preferred = puzzles
        .iter()
        .find(|puzzle| puzzle.id == "foods")
        .unwrap_or(&puzzles[0]);
    let (puzzle, words) = load_crossword_puzzle(&preferred.id, dir)?;
    Ok((puzzle, words, puzzles))
}

pub fn list_word_search_puzzles(dir: &Path) -> Vec<WordSearchPuzzleInfo> {
    json_files(dir)
        .into_iter()
        .map(|file| WordSearchPuzzleInfo {
            id: file.trim_end_matches(".json").to_string(),
            label: file,
        })
        .collect()
}

pub fn load_word_search_puzzle(
    id: &str,
    dir: &Path,
) -> Result<(WordSearchFile, Vec<WordSearchWord>), String> {
    if !valid_pack_id(id) {
        return Err("Invalid word search id".into());
    }
    let path = dir.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(format!("Word search \"{id}\" not found"));
    }
    let raw = fs::read_to_string(&path).map_err(|_| format!("Could not read word search \"{id}\""))?;
    let mut puzzle: WordSearchFile =
        serde_json::from_str(&raw).map_err(|_| format!("Could not read word search \"{id}\""))?;
    if puzzle.id.trim().is_empty() {
        puzzle.id = id.to_string();
    }
    if let Some(error) = validate_word_search_file(&puzzle) {
        return Err(error);
    }
    let words = derive_word_search_words(&puzzle)?;
    Ok((puzzle, words))
}

pub fn load_default_word_search(
    dir: &Path,
) -> Result<(WordSearchFile, Vec<WordSearchWord>, Vec<WordSearchPuzzleInfo>), String> {
    let puzzles = list_word_search_puzzles(dir);
    if puzzles.is_empty() {
        return Err(format!("No word search puzzles found in {}", dir.display()));
    }
    let preferred = puzzles
        .iter()
        .find(|puzzle| puzzle.id == "canada")
        .unwrap_or(&puzzles[0]);
    let (puzzle, words) = load_word_search_puzzle(&preferred.id, dir)?;
    Ok((puzzle, words, puzzles))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_filenames() {
        assert_eq!(label_from_question_set_id("dog-facts"), "Dog Facts");
        assert_eq!(label_from_question_set_id("world-foods"), "World Foods");
        assert_eq!(label_from_question_set_id("canada"), "Canada");
    }

    #[test]
    fn lists_question_packs() {
        let dir = resolve_questions_dir();
        let sets = list_question_sets(&dir);
        let ids: Vec<_> = sets.iter().map(|set| set.id.as_str()).collect();
        for expected in ["canada", "cat-facts", "dog-facts", "geography", "world-foods"] {
            assert!(ids.contains(&expected), "{expected} missing from {ids:?}");
        }
        assert_eq!(
            sets.iter().find(|set| set.id == "cat-facts").unwrap().label,
            "Cat Facts"
        );
    }

    #[test]
    fn loads_question_pack_and_prefixes_ids() {
        let dir = resolve_questions_dir();
        assert!(load_question_set("dog-facts", &dir).unwrap().len() > 0);
        let combined =
            load_question_sets_in_order(&["dog-facts".into(), "cat-facts".into()], &dir).unwrap();
        assert!(combined[0].id.starts_with("dog-facts:"));
        assert!(combined.iter().any(|question| question.id.starts_with("cat-facts:")));
        assert!(load_question_set("does-not-exist", &dir).is_err());
    }

    #[test]
    fn loads_foods_crossword() {
        let dir = resolve_crossword_dir();
        let (puzzle, words) = load_crossword_puzzle("foods", &dir).unwrap();
        assert_eq!(puzzle.id, "foods");
        assert!(!words.is_empty());
        let listed = list_crossword_puzzles(&dir);
        assert!(listed.iter().any(|puzzle| puzzle.label == "foods.json"));
    }

    #[test]
    fn loads_canada_word_search() {
        let dir = resolve_word_search_dir();
        let (puzzle, words) = load_word_search_puzzle("canada", &dir).unwrap();
        assert_eq!(puzzle.id, "canada");
        assert_eq!(words.len(), 10);
        let listed = list_word_search_puzzles(&dir);
        assert!(listed.iter().any(|puzzle| puzzle.label == "canada.json"));
    }
}
