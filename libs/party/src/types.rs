use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameStatus {
    Waiting,
    Active,
    Paused,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GamePhase {
    Multiplier,
    Answering,
    Reveal,
    Leaderboard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuestionSetMode {
    Single,
    Continuous,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerOption {
    pub id: String,
    pub text: String,
    pub correct: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub question: String,
    pub answers: Vec<AnswerOption>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiplier: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionsFile {
    pub questions: Vec<Question>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSetInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub time_limit_seconds: i64,
    pub default_score: i64,
    pub min_score: i64,
    pub scale_ms: i64,
    pub reveal_duration_ms: i64,
    pub leaderboard_duration_ms: i64,
}

pub const MIN_TIME_LIMIT_SECONDS: i64 = 10;
pub const MIN_REVEAL_DURATION_MS: i64 = 500;
pub const MAX_REVEAL_DURATION_MS: i64 = 30_000;
pub const MIN_LEADERBOARD_DURATION_MS: i64 = 500;
pub const MAX_LEADERBOARD_DURATION_MS: i64 = 60_000;
pub const MIN_SCHEDULE_DELAY_MINUTES: i64 = 1;
pub const MAX_SCHEDULE_DELAY_MINUTES: i64 = 180;

pub const DEFAULT_GAME_CONFIG: GameConfig = GameConfig {
    time_limit_seconds: 30,
    default_score: 1000,
    min_score: 100,
    scale_ms: 100,
    reveal_duration_ms: 2_000,
    leaderboard_duration_ms: 3_000,
};

pub const MULTIPLIER_SPLASH_DURATION_MS: i64 = 5_000;
pub const REVEAL_DURATION_MS: i64 = DEFAULT_GAME_CONFIG.reveal_duration_ms;
pub const LEADERBOARD_DURATION_MS: i64 = DEFAULT_GAME_CONFIG.leaderboard_duration_ms;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerPublic {
    pub id: String,
    pub name: String,
    pub score: i64,
    pub connected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub id: String,
    pub name: String,
    pub score: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionPublic {
    pub id: String,
    pub question: String,
    pub answers: Vec<AnswerPublic>,
    pub index: i64,
    pub total: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multiplier: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerPublic {
    pub id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correct: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAnswer {
    pub answer_id: String,
    pub points: i64,
    pub correct: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStateSnapshot {
    pub status: GameStatus,
    pub phase: Option<GamePhase>,
    pub config: GameConfig,
    pub players: Vec<PlayerPublic>,
    pub leaderboard: Vec<LeaderboardEntry>,
    pub current_question: Option<QuestionPublic>,
    pub question_started_at: Option<i64>,
    pub question_ends_at: Option<i64>,
    pub phase_ends_at: Option<i64>,
    pub server_now: i64,
    pub remaining_ms: i64,
    pub question_index: i64,
    pub total_questions: i64,
    pub viewer_answer: Option<ViewerAnswer>,
    pub waiting_player_count: i64,
    pub answered_player_count: i64,
    pub total_player_count: i64,
    pub question_set_id: String,
    pub question_set_ids: Vec<String>,
    pub question_set_mode: QuestionSetMode,
    pub question_sets: Vec<QuestionSetInfo>,
    pub viewer_finished_game: bool,
    pub scheduled_start_at: Option<i64>,
}

pub const SYSTEM_REMOVAL_REASON: &str = "Removed from the system by admin";
pub const QUIZ_REMOVAL_REASON: &str = "Removed from the quiz game";
