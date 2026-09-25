use crate::types::{
    GameConfig, Question, QuestionsFile, MAX_LEADERBOARD_DURATION_MS, MAX_REVEAL_DURATION_MS,
    MIN_LEADERBOARD_DURATION_MS, MIN_REVEAL_DURATION_MS, MIN_TIME_LIMIT_SECONDS,
};

pub fn validate_game_config(config: &GameConfig) -> Result<GameConfig, String> {
    if config.time_limit_seconds < MIN_TIME_LIMIT_SECONDS {
        return Err(format!(
            "timeLimitSeconds must be at least {MIN_TIME_LIMIT_SECONDS}"
        ));
    }
    if config.default_score < 0 {
        return Err("defaultScore must be a non-negative number".into());
    }
    if config.min_score < 0 {
        return Err("minScore must be a non-negative number".into());
    }
    if config.min_score > config.default_score {
        return Err("minScore cannot exceed defaultScore".into());
    }
    if config.scale_ms <= 0 {
        return Err("scaleMs must be a positive number (milliseconds)".into());
    }
    if !(MIN_REVEAL_DURATION_MS..=MAX_REVEAL_DURATION_MS).contains(&config.reveal_duration_ms) {
        return Err(format!(
            "revealDurationMs must be between {MIN_REVEAL_DURATION_MS} and {MAX_REVEAL_DURATION_MS}"
        ));
    }
    if !(MIN_LEADERBOARD_DURATION_MS..=MAX_LEADERBOARD_DURATION_MS)
        .contains(&config.leaderboard_duration_ms)
    {
        return Err(format!(
            "leaderboardDurationMs must be between {MIN_LEADERBOARD_DURATION_MS} and {MAX_LEADERBOARD_DURATION_MS}"
        ));
    }
    Ok(config.clone())
}

pub fn validate_question(question: &Question, index: usize) -> Option<String> {
    if question.id.trim().is_empty() {
        return Some(format!("Question at index {index} is missing id"));
    }
    if question.question.trim().is_empty() {
        return Some(format!("Question {} is missing question text", question.id));
    }
    if question.answers.len() != 4 {
        return Some(format!(
            "Question {} must have exactly 4 answers",
            question.id
        ));
    }
    let correct_count = question.answers.iter().filter(|answer| answer.correct).count();
    if correct_count != 1 {
        return Some(format!(
            "Question {} must have exactly one correct answer",
            question.id
        ));
    }
    for answer in &question.answers {
        if answer.id.trim().is_empty() || answer.text.trim().is_empty() {
            return Some(format!("Question {} has an invalid answer", question.id));
        }
    }
    if let Some(score) = question.score {
        if score <= 0 {
            return Some(format!(
                "Question {} score must be a positive number when provided",
                question.id
            ));
        }
    }
    if let Some(multiplier) = question.multiplier {
        if !multiplier.is_finite() || multiplier <= 1.0 {
            return Some(format!(
                "Question {} multiplier must be a number greater than 1 when provided",
                question.id
            ));
        }
    }
    None
}

pub fn validate_questions_file(file: &QuestionsFile) -> Option<String> {
    if file.questions.is_empty() {
        return Some("Questions file must contain a non-empty questions array".into());
    }
    for (index, question) in file.questions.iter().enumerate() {
        if let Some(error) = validate_question(question, index) {
            return Some(error);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AnswerOption, DEFAULT_GAME_CONFIG};
    use std::fs;
    use std::path::PathBuf;

    fn questions_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/server/questions")
    }

    fn question(multiplier: Option<f64>, correct_flags: [bool; 4]) -> Question {
        Question {
            id: "x".into(),
            question: "Test?".into(),
            answers: ["a", "b", "c", "d"]
                .into_iter()
                .zip(correct_flags)
                .map(|(id, correct)| AnswerOption {
                    id: id.into(),
                    text: id.to_uppercase(),
                    correct,
                })
                .collect(),
            score: None,
            multiplier,
        }
    }

    #[test]
    fn accepts_valid_config() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.time_limit_seconds = 10;
        assert!(validate_game_config(&config).is_ok());
    }

    #[test]
    fn rejects_time_limit_below_10() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.time_limit_seconds = 9;
        let error = validate_game_config(&config).unwrap_err();
        assert!(error.contains("at least 10"));
    }

    #[test]
    fn rejects_min_score_above_default() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.default_score = 100;
        config.min_score = 200;
        assert!(validate_game_config(&config).is_err());
    }

    #[test]
    fn rejects_non_positive_scale() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.scale_ms = 0;
        assert!(validate_game_config(&config).is_err());
    }

    #[test]
    fn rejects_reveal_out_of_range() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.reveal_duration_ms = 100;
        assert!(validate_game_config(&config).is_err());
    }

    #[test]
    fn rejects_leaderboard_out_of_range() {
        let mut config = DEFAULT_GAME_CONFIG;
        config.leaderboard_duration_ms = 100_000;
        assert!(validate_game_config(&config).is_err());
    }

    #[test]
    fn validates_shipped_question_packs() {
        let files: Vec<_> = fs::read_dir(questions_dir())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
            .collect();
        assert!(files.len() >= 5);
        for file in files {
            let raw = fs::read_to_string(&file).unwrap();
            let data: QuestionsFile = serde_json::from_str(&raw).unwrap();
            assert!(
                validate_questions_file(&data).is_none(),
                "{}",
                file.display()
            );
            assert!(data.questions.len() >= 10);
        }
    }

    #[test]
    fn validates_seed_dog_fact_multipliers() {
        let path = questions_dir().join("dog-facts.json");
        let data: QuestionsFile = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert!(validate_questions_file(&data).is_none());
        assert_eq!(data.questions.len(), 10);
        assert_eq!(data.questions[2].multiplier, Some(2.0));
        assert_eq!(data.questions[5].multiplier, Some(3.0));
    }

    #[test]
    fn requires_exactly_one_correct_answer() {
        let bad = question(None, [true, true, false, false]);
        let error = validate_questions_file(&QuestionsFile {
            questions: vec![bad],
        })
        .unwrap();
        assert!(error.contains("exactly one correct"));
    }

    #[test]
    fn rejects_invalid_multipliers() {
        let bad = question(Some(1.0), [true, false, false, false]);
        let error = validate_questions_file(&QuestionsFile {
            questions: vec![bad],
        })
        .unwrap();
        assert!(error.contains("multiplier"));
    }
}
