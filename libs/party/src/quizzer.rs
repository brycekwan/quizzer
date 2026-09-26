use crate::clock::Clock;
use crate::names::{is_name_taken, is_valid_player_name, normalize_player_name};
use crate::scoring::{compute_question_score, resolve_base_score, ScoreInput};
use crate::session::new_player_id;
use crate::types::{
    AnswerPublic, GameConfig, GamePhase, GameStateSnapshot, GameStatus, LeaderboardEntry,
    PlayerPublic, Question, QuestionPublic, QuestionSetInfo, QuestionSetMode, ViewerAnswer,
    DEFAULT_GAME_CONFIG, MAX_SCHEDULE_DELAY_MINUTES, MIN_SCHEDULE_DELAY_MINUTES,
    MULTIPLIER_SPLASH_DURATION_MS,
};
use crate::validation::validate_game_config;
use indexmap::IndexMap;
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub score: i64,
    pub connected: bool,
    pub socket_id: Option<String>,
}

#[derive(Debug, Clone)]
struct PendingAnswer {
    answer_id: String,
    points: i64,
    applied: bool,
}

#[derive(Debug, Clone, Copy)]
enum PhaseAction {
    EnterAnswering,
    EnterReveal,
    EnterLeaderboard,
    AdvanceAfterLeaderboard,
}

pub struct GameEngine {
    players: IndexMap<String, Player>,
    participants: HashSet<String>,
    config: GameConfig,
    status: GameStatus,
    phase: Option<GamePhase>,
    question_index: i64,
    question_started_at: Option<i64>,
    question_ends_at: Option<i64>,
    phase_ends_at: Option<i64>,
    scheduled_start_at: Option<i64>,
    answers: IndexMap<String, PendingAnswer>,
    phase_deadline: Option<i64>,
    phase_action: Option<PhaseAction>,
    schedule_deadline: Option<i64>,
    questions: Vec<Question>,
    question_set_id: String,
    question_set_ids: Vec<String>,
    question_set_mode: QuestionSetMode,
    question_sets: Vec<QuestionSetInfo>,
    clock: Clock,
}

#[derive(Debug)]
pub struct JoinOk {
    pub player: Player,
    pub replaced_socket_id: Option<String>,
}

impl GameEngine {
    pub fn new(questions: Vec<Question>) -> Self {
        Self::with_clock(questions, Clock::system(), None)
    }

    pub fn with_options(
        questions: Vec<Question>,
        clock: Clock,
        question_set_id: Option<String>,
        question_set_ids: Option<Vec<String>>,
        question_set_mode: Option<QuestionSetMode>,
        question_sets: Option<Vec<QuestionSetInfo>>,
    ) -> Self {
        Self::with_clock(
            questions,
            clock,
            Some(EngineOptions {
                question_set_id,
                question_set_ids,
                question_set_mode,
                question_sets,
            }),
        )
    }

    fn with_clock(questions: Vec<Question>, clock: Clock, options: Option<EngineOptions>) -> Self {
        let options = options.unwrap_or(EngineOptions {
            question_set_id: None,
            question_set_ids: None,
            question_set_mode: None,
            question_sets: None,
        });
        let question_set_id = options.question_set_id.unwrap_or_else(|| "default".into());
        let question_set_ids = options
            .question_set_ids
            .unwrap_or_else(|| vec![question_set_id.clone()]);
        let question_set_mode = options.question_set_mode.unwrap_or(QuestionSetMode::Single);
        let question_sets = options.question_sets.unwrap_or_else(|| {
            vec![QuestionSetInfo {
                id: question_set_id.clone(),
                label: question_set_id.clone(),
            }]
        });
        Self {
            players: IndexMap::new(),
            participants: HashSet::new(),
            config: DEFAULT_GAME_CONFIG,
            status: GameStatus::Waiting,
            phase: None,
            question_index: -1,
            question_started_at: None,
            question_ends_at: None,
            phase_ends_at: None,
            scheduled_start_at: None,
            answers: IndexMap::new(),
            phase_deadline: None,
            phase_action: None,
            schedule_deadline: None,
            questions,
            question_set_id,
            question_set_ids,
            question_set_mode,
            question_sets,
            clock,
        }
    }

    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    fn now(&self) -> i64 {
        self.clock.now()
    }

    pub fn next_deadline(&self) -> Option<i64> {
        match (self.schedule_deadline, self.phase_deadline) {
            (Some(schedule), Some(phase)) => Some(schedule.min(phase)),
            (Some(schedule), None) => Some(schedule),
            (None, Some(phase)) => Some(phase),
            (None, None) => None,
        }
    }

    /// Fire timers that are due at the current clock. Newly armed timers are not run
    /// until a later call, matching `setTimeout`.
    pub fn fire_due(&mut self) -> bool {
        let mut changed = false;
        for _ in 0..8 {
            let now = self.now();
            let schedule_due = self.schedule_deadline.is_some_and(|at| now >= at);
            let phase_due = self.phase_deadline.is_some_and(|at| now >= at);
            if !schedule_due && !phase_due {
                break;
            }
            let fire_schedule = match (self.schedule_deadline, self.phase_deadline) {
                (Some(schedule), Some(phase)) if schedule_due && phase_due => schedule <= phase,
                (Some(_), _) if schedule_due => true,
                _ => false,
            };
            if fire_schedule {
                self.schedule_deadline = None;
                self.scheduled_start_at = None;
                let _ = self.begin_game();
            } else if let Some(action) = self.phase_action.take() {
                self.phase_deadline = None;
                self.run_action(action);
            } else {
                self.phase_deadline = None;
            }
            changed = true;
        }
        changed
    }

    pub fn advance(&mut self, delta_ms: i64) {
        assert!(self.clock.is_manual(), "advance requires a manual clock");
        let target = self.now() + delta_ms;
        loop {
            let Some(next) = self.next_deadline() else {
                self.clock.set(target);
                break;
            };
            if next > target {
                self.clock.set(target);
                break;
            }
            self.clock.set(next);
            self.fire_due();
        }
    }

    fn clear_phase_timer(&mut self) {
        self.phase_deadline = None;
        self.phase_action = None;
    }

    fn clear_schedule_timer(&mut self) {
        self.schedule_deadline = None;
    }

    fn schedule(&mut self, delay_ms: i64, action: PhaseAction) {
        self.clear_phase_timer();
        let delay = delay_ms.max(0);
        self.phase_deadline = Some(self.now() + delay);
        self.phase_action = Some(action);
    }

    fn run_action(&mut self, action: PhaseAction) {
        match action {
            PhaseAction::EnterAnswering => self.enter_answering(),
            PhaseAction::EnterReveal => self.enter_reveal(),
            PhaseAction::EnterLeaderboard => self.enter_leaderboard(),
            PhaseAction::AdvanceAfterLeaderboard => self.advance_after_leaderboard(),
        }
    }

    pub fn get_player_by_socket(&self, socket_id: &str) -> Option<&Player> {
        self.players
            .values()
            .find(|player| player.socket_id.as_deref() == Some(socket_id))
    }

    pub fn get_player(&self, player_id: &str) -> Option<&Player> {
        self.players.get(player_id)
    }

    fn find_player_by_name(&self, name: &str) -> Option<String> {
        let target = normalize_player_name(name).to_lowercase();
        self.players
            .values()
            .find(|player| normalize_player_name(&player.name).to_lowercase() == target)
            .map(|player| player.id.clone())
    }

    pub fn set_question_sets(&mut self, sets: Vec<QuestionSetInfo>) {
        self.question_sets = sets;
    }

    pub fn set_questions(
        &mut self,
        question_set_ids: Vec<String>,
        questions: Vec<Question>,
        mode: QuestionSetMode,
    ) -> Result<(), String> {
        if self.status != GameStatus::Waiting {
            return Err("Question set can only be changed while waiting".into());
        }
        if question_set_ids.is_empty() {
            return Err("Select at least one question set".into());
        }
        if mode == QuestionSetMode::Single && question_set_ids.len() != 1 {
            return Err("Single mode requires exactly one question set".into());
        }
        if questions.is_empty() {
            return Err("Question set is empty".into());
        }
        self.question_set_mode = mode;
        self.question_set_id = question_set_ids[0].clone();
        self.question_set_ids = question_set_ids;
        self.questions = questions;
        self.question_index = -1;
        Ok(())
    }

    pub fn join(
        &mut self,
        name: &str,
        socket_id: &str,
        player_id: Option<&str>,
    ) -> Result<JoinOk, String> {
        if !is_valid_player_name(name) {
            return Err("Name must be 1–24 characters".into());
        }
        let normalized = normalize_player_name(name);

        if let Some(player_id) = player_id {
        if self.players.contains_key(player_id) {
            let replaced_socket_id = {
                let existing = self.players.get_mut(player_id).expect("player");
                let replaced_socket_id = existing
                    .socket_id
                    .clone()
                    .filter(|current| current != socket_id);
                existing.socket_id = Some(socket_id.to_string());
                existing.connected = true;
                replaced_socket_id
            };
            let player = self.players.get(player_id).expect("player").clone();
            if self.status != GameStatus::Finished {
                self.participants.insert(player.id.clone());
            }
            return Ok(JoinOk {
                player,
                replaced_socket_id,
            });
        }
        }

        if let Some(id) = self.find_player_by_name(&normalized) {
            if player_id.is_some_and(|requested| requested != id) {
                return Err("That name is already in use by another player".into());
            }
            let by_name = self.players.get(&id).expect("player");
            if by_name.connected && by_name.socket_id.as_deref() != Some(socket_id) {
                return Err("That name is already in use by another player".into());
            }
            let replaced_socket_id = {
                let by_name = self.players.get_mut(&id).expect("player");
                let replaced_socket_id = by_name
                    .socket_id
                    .clone()
                    .filter(|current| current != socket_id);
                by_name.socket_id = Some(socket_id.to_string());
                by_name.connected = true;
                replaced_socket_id
            };
            let player = self.players.get(&id).expect("player").clone();
            if self.status != GameStatus::Finished {
                self.participants.insert(id);
            }
            return Ok(JoinOk {
                player,
                replaced_socket_id,
            });
        }

        let names: Vec<String> = self.players.values().map(|player| player.name.clone()).collect();
        if is_name_taken(&normalized, names.iter().map(String::as_str)) {
            return Err("That name is already taken".into());
        }

        let id = match player_id {
            Some(player_id) if !self.players.contains_key(player_id) => player_id.to_string(),
            _ => new_player_id(),
        };
        let player = Player {
            id: id.clone(),
            name: normalized,
            score: 0,
            connected: true,
            socket_id: Some(socket_id.to_string()),
        };
        self.players.insert(id.clone(), player.clone());
        if self.status != GameStatus::Finished {
            self.participants.insert(id);
        }
        Ok(JoinOk {
            player,
            replaced_socket_id: None,
        })
    }

    pub fn mark_disconnected(&mut self, socket_id: &str) {
        let Some(id) = self
            .players
            .values()
            .find(|player| player.socket_id.as_deref() == Some(socket_id))
            .map(|player| player.id.clone())
        else {
            return;
        };
        let Some(player) = self.players.get_mut(&id) else {
            return;
        };
        if player.socket_id.as_deref() != Some(socket_id) {
            return;
        }
        player.connected = false;
        player.socket_id = None;
    }

    /// Drop the player from the live quiz and keep their score and record.
    pub fn eject(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let socket_id = {
            let Some(player) = self.players.get_mut(player_id) else {
                return Err("Player not found".into());
            };
            let socket_id = player.socket_id.clone();
            player.connected = false;
            player.socket_id = None;
            socket_id
        };
        self.participants.remove(player_id);
        self.answers.shift_remove(player_id);
        if self.phase == Some(GamePhase::Answering) && self.all_players_answered() {
            self.enter_reveal();
        }
        Ok(socket_id)
    }

    pub fn kick(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let Some(player) = self.players.shift_remove(player_id) else {
            return Err("Player not found".into());
        };
        let socket_id = player.socket_id;
        self.answers.shift_remove(player_id);
        self.participants.remove(player_id);
        if self.phase == Some(GamePhase::Answering) && self.all_players_answered() {
            self.enter_reveal();
        }
        Ok(socket_id)
    }

    pub fn update_config(&mut self, partial: &GameConfig) -> Result<(), String> {
        if self.status != GameStatus::Waiting && self.status != GameStatus::Paused {
            return Err("Config can only be changed while waiting or paused".into());
        }
        self.config = validate_game_config(partial)?;
        Ok(())
    }

    /// Merge a partial config onto the current one, then validate.
    pub fn update_config_partial(
        &mut self,
        time_limit_seconds: Option<i64>,
        default_score: Option<i64>,
        min_score: Option<i64>,
        scale_ms: Option<i64>,
        reveal_duration_ms: Option<i64>,
        leaderboard_duration_ms: Option<i64>,
    ) -> Result<(), String> {
        let mut next = self.config.clone();
        if let Some(value) = time_limit_seconds {
            next.time_limit_seconds = value;
        }
        if let Some(value) = default_score {
            next.default_score = value;
        }
        if let Some(value) = min_score {
            next.min_score = value;
        }
        if let Some(value) = scale_ms {
            next.scale_ms = value;
        }
        if let Some(value) = reveal_duration_ms {
            next.reveal_duration_ms = value;
        }
        if let Some(value) = leaderboard_duration_ms {
            next.leaderboard_duration_ms = value;
        }
        self.update_config(&next)
    }

    pub fn start(&mut self, delay_minutes: f64) -> Result<(), String> {
        if self.status != GameStatus::Waiting && self.status != GameStatus::Finished {
            return Err("Game can only start from waiting".into());
        }
        if self.questions.is_empty() {
            return Err("No questions loaded".into());
        }
        if delay_minutes > 0.0 {
            if !delay_minutes.is_finite()
                || delay_minutes < MIN_SCHEDULE_DELAY_MINUTES as f64
                || delay_minutes > MAX_SCHEDULE_DELAY_MINUTES as f64
            {
                return Err("delayMinutes must be between 1 and 180".into());
            }
            self.clear_schedule_timer();
            let delay_ms = (delay_minutes * 60_000.0).round() as i64;
            self.scheduled_start_at = Some(self.now() + delay_ms);
            self.schedule_deadline = self.scheduled_start_at;
            return Ok(());
        }
        self.begin_game().map(|_| ())
    }

    pub fn cancel_scheduled_start(&mut self) {
        self.clear_schedule_timer();
        if self.scheduled_start_at.is_some() {
            self.scheduled_start_at = None;
        }
    }

    fn begin_game(&mut self) -> Result<(), String> {
        if self.status != GameStatus::Waiting && self.status != GameStatus::Finished {
            return Err("Game can only start from waiting".into());
        }
        if self.questions.is_empty() {
            return Err("No questions loaded".into());
        }
        self.clear_schedule_timer();
        self.scheduled_start_at = None;
        self.clear_phase_timer();
        self.answers.clear();
        self.participants.clear();
        let ids: Vec<String> = self.players.keys().cloned().collect();
        for id in ids {
            if let Some(player) = self.players.get_mut(&id) {
                player.score = 0;
            }
            self.participants.insert(id);
        }
        self.status = GameStatus::Active;
        self.question_index = -1;
        self.begin_next_question();
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), String> {
        if self.status != GameStatus::Active {
            return Err("Game is not active".into());
        }
        if self.phase != Some(GamePhase::Leaderboard) {
            return Err("Pause is only allowed during the leaderboard phase".into());
        }
        self.clear_phase_timer();
        self.status = GameStatus::Paused;
        self.phase_ends_at = None;
        Ok(())
    }

    pub fn resume(&mut self) -> Result<(), String> {
        if self.status != GameStatus::Paused {
            return Err("Game is not paused".into());
        }
        self.status = GameStatus::Active;
        self.advance_after_leaderboard();
        Ok(())
    }

    pub fn reset(&mut self) -> Vec<String> {
        self.clear_phase_timer();
        self.clear_schedule_timer();
        self.scheduled_start_at = None;
        let socket_ids = self
            .players
            .values()
            .filter_map(|player| player.socket_id.clone())
            .collect();
        self.players.clear();
        self.participants.clear();
        self.status = GameStatus::Waiting;
        self.phase = None;
        self.question_index = -1;
        self.question_started_at = None;
        self.question_ends_at = None;
        self.phase_ends_at = None;
        self.answers.clear();
        socket_ids
    }

    pub fn submit_answer(&mut self, player_id: &str, answer_id: &str) -> Result<i64, String> {
        if self.status != GameStatus::Active || self.phase != Some(GamePhase::Answering) {
            return Err("Not accepting answers right now".into());
        }
        if !self.players.contains_key(player_id) {
            return Err("Player not found".into());
        }
        if !self.participants.contains(player_id) {
            return Err("You are not in this quiz".into());
        }
        if self.answers.contains_key(player_id) {
            return Err("Answer already locked".into());
        }
        let now = self.now();
        if self.question_ends_at.is_some_and(|ends| now >= ends) {
            return Err("Time is up".into());
        }
        let Some(question) = self.questions.get(self.question_index as usize) else {
            return Err("No active question".into());
        };
        let Some(option) = question.answers.iter().find(|answer| answer.id == answer_id) else {
            return Err("Invalid answer".into());
        };
        let elapsed_ms = (now - self.question_started_at.unwrap_or(now)).max(0);
        let base_score = resolve_base_score(question.score, &self.config);
        let points = compute_question_score(ScoreInput {
            elapsed_ms,
            time_limit_seconds: self.config.time_limit_seconds,
            scale_ms: self.config.scale_ms,
            base_score,
            min_score: self.config.min_score,
            is_correct: option.correct,
            multiplier: question.multiplier,
        });
        self.answers.insert(
            player_id.to_string(),
            PendingAnswer {
                answer_id: answer_id.to_string(),
                points,
                applied: false,
            },
        );
        if self.all_players_answered() {
            self.enter_reveal();
        }
        Ok(points)
    }

    fn all_players_answered(&self) -> bool {
        let relevant: Vec<_> = self
            .players
            .values()
            .filter(|player| {
                self.participants.contains(&player.id)
                    && (player.connected || self.answers.contains_key(&player.id))
            })
            .collect();
        if relevant.is_empty() {
            return false;
        }
        relevant.iter().all(|player| self.answers.contains_key(&player.id))
    }

    fn answer_counts(&self) -> (i64, i64, i64) {
        let playing: Vec<_> = self
            .players
            .values()
            .filter(|player| self.participants.contains(&player.id))
            .collect();
        let total = playing.len() as i64;
        let answered = playing
            .iter()
            .filter(|player| self.answers.contains_key(&player.id))
            .count() as i64;
        let waiting = if self.phase == Some(GamePhase::Answering) {
            (total - answered).max(0)
        } else {
            0
        };
        (answered, total, waiting)
    }

    fn begin_next_question(&mut self) {
        self.question_index += 1;
        if self.question_index >= self.questions.len() as i64 {
            self.status = GameStatus::Finished;
            self.phase = None;
            self.question_started_at = None;
            self.question_ends_at = None;
            self.phase_ends_at = None;
            self.clear_phase_timer();
            return;
        }
        self.answers.clear();
        self.status = GameStatus::Active;
        self.question_started_at = None;
        self.question_ends_at = None;
        let multiplier = self.questions[self.question_index as usize].multiplier;
        if multiplier.is_some_and(|value| value > 1.0) {
            self.phase = Some(GamePhase::Multiplier);
            let splash_ends = self.now() + MULTIPLIER_SPLASH_DURATION_MS;
            self.phase_ends_at = Some(splash_ends);
            let delay = splash_ends - self.now();
            self.schedule(delay, PhaseAction::EnterAnswering);
            return;
        }
        self.enter_answering();
    }

    fn enter_answering(&mut self) {
        if self.status != GameStatus::Active {
            return;
        }
        self.clear_phase_timer();
        self.answers.clear();
        self.phase = Some(GamePhase::Answering);
        let started = self.now();
        self.question_started_at = Some(started);
        self.question_ends_at = Some(started + self.config.time_limit_seconds * 1000);
        self.phase_ends_at = self.question_ends_at;
        let delay = self.question_ends_at.unwrap_or(started) - self.now();
        self.schedule(delay, PhaseAction::EnterReveal);
    }

    fn apply_pending_scores(&mut self) {
        let pending: Vec<(String, i64)> = self
            .answers
            .iter()
            .filter(|(_, answer)| !answer.applied)
            .map(|(id, answer)| (id.clone(), answer.points))
            .collect();
        for (player_id, points) in pending {
            if let Some(player) = self.players.get_mut(&player_id) {
                player.score += points;
            }
            if let Some(answer) = self.answers.get_mut(&player_id) {
                answer.applied = true;
            }
        }
    }

    fn finalize_missing_answers(&mut self) {
        let missing: Vec<String> = self
            .players
            .keys()
            .filter(|id| !self.answers.contains_key(*id))
            .cloned()
            .collect();
        for player_id in missing {
            self.answers.insert(
                player_id,
                PendingAnswer {
                    answer_id: String::new(),
                    points: 0,
                    applied: false,
                },
            );
        }
    }

    fn enter_reveal(&mut self) {
        if self.phase != Some(GamePhase::Answering) {
            return;
        }
        self.clear_phase_timer();
        self.finalize_missing_answers();
        self.apply_pending_scores();
        self.phase = Some(GamePhase::Reveal);
        let duration = self.config.reveal_duration_ms;
        self.phase_ends_at = Some(self.now() + duration);
        self.schedule(duration, PhaseAction::EnterLeaderboard);
    }

    fn enter_leaderboard(&mut self) {
        if self.phase != Some(GamePhase::Reveal) {
            return;
        }
        self.clear_phase_timer();
        self.phase = Some(GamePhase::Leaderboard);
        let duration = self.config.leaderboard_duration_ms;
        self.phase_ends_at = Some(self.now() + duration);
        self.schedule(duration, PhaseAction::AdvanceAfterLeaderboard);
    }

    fn advance_after_leaderboard(&mut self) {
        self.clear_phase_timer();
        if self.question_index + 1 >= self.questions.len() as i64 {
            self.status = GameStatus::Finished;
            self.phase = None;
            self.question_ends_at = None;
            self.phase_ends_at = None;
            return;
        }
        self.begin_next_question();
    }

    pub fn leaderboard(&self) -> Vec<LeaderboardEntry> {
        let mut players: Vec<&Player> = self.players.values().collect();
        players.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.name.cmp(&b.name)));
        players
            .into_iter()
            .enumerate()
            .map(|(index, player)| LeaderboardEntry {
                rank: (index + 1) as i64,
                id: player.id.clone(),
                name: player.name.clone(),
                score: player.score,
            })
            .collect()
    }

    fn to_question_public(&self, include_correct: bool) -> Option<QuestionPublic> {
        if self.question_index < 0 || self.question_index >= self.questions.len() as i64 {
            return None;
        }
        let question = &self.questions[self.question_index as usize];
        Some(QuestionPublic {
            id: question.id.clone(),
            question: question.question.clone(),
            index: self.question_index,
            total: self.questions.len() as i64,
            multiplier: question.multiplier.filter(|value| *value > 1.0),
            answers: question
                .answers
                .iter()
                .map(|answer| AnswerPublic {
                    id: answer.id.clone(),
                    text: answer.text.clone(),
                    correct: include_correct.then_some(answer.correct),
                })
                .collect(),
        })
    }

    pub fn remaining_ms(&self) -> i64 {
        let now = self.now();
        if self.phase == Some(GamePhase::Answering) {
            if let Some(ends) = self.question_ends_at {
                return (ends - now).max(0);
            }
        }
        if matches!(
            self.phase,
            Some(GamePhase::Multiplier | GamePhase::Reveal | GamePhase::Leaderboard)
        ) {
            if let Some(ends) = self.phase_ends_at {
                return (ends - now).max(0);
            }
        }
        if self.status == GameStatus::Waiting {
            if let Some(start) = self.scheduled_start_at {
                return (start - now).max(0);
            }
        }
        0
    }

    pub fn snapshot(&self, role: SnapshotRole, viewer_player_id: Option<&str>) -> GameStateSnapshot {
        let include_correct = role == SnapshotRole::Admin
            || matches!(
                self.phase,
                Some(GamePhase::Reveal | GamePhase::Leaderboard)
            )
            || self.status == GameStatus::Paused
            || self.status == GameStatus::Finished;

        let viewer_answer = viewer_player_id.and_then(|viewer_id| {
            let pending = self.answers.get(viewer_id)?;
            let question = self.questions.get(self.question_index.max(0) as usize);
            let option = if pending.answer_id.is_empty() {
                None
            } else {
                question.and_then(|question| {
                    question
                        .answers
                        .iter()
                        .find(|answer| answer.id == pending.answer_id)
                })
            };
            Some(ViewerAnswer {
                answer_id: pending.answer_id.clone(),
                points: pending.points,
                correct: option.is_some_and(|answer| answer.correct),
            })
        });

        let (answered_player_count, total_player_count, waiting_player_count) = self.answer_counts();
        let viewer_finished_game = self.status == GameStatus::Finished
            && viewer_player_id.is_some_and(|id| self.participants.contains(id));

        GameStateSnapshot {
            status: self.status,
            phase: self.phase,
            config: self.config.clone(),
            players: self
                .players
                .values()
                .map(|player| PlayerPublic {
                    id: player.id.clone(),
                    name: player.name.clone(),
                    score: player.score,
                    connected: player.connected,
                })
                .collect(),
            leaderboard: self.leaderboard(),
            current_question: self.to_question_public(include_correct),
            question_started_at: self.question_started_at,
            question_ends_at: self.question_ends_at,
            phase_ends_at: self.phase_ends_at,
            server_now: self.now(),
            remaining_ms: self.remaining_ms(),
            question_index: self.question_index,
            total_questions: self.questions.len() as i64,
            viewer_answer,
            waiting_player_count,
            answered_player_count,
            total_player_count,
            question_set_id: self.question_set_id.clone(),
            question_set_ids: self.question_set_ids.clone(),
            question_set_mode: self.question_set_mode,
            question_sets: self.question_sets.clone(),
            viewer_finished_game,
            scheduled_start_at: self.scheduled_start_at,
        }
    }

    pub fn status(&self) -> GameStatus {
        self.status
    }

    pub fn phase(&self) -> Option<GamePhase> {
        self.phase
    }
}

struct EngineOptions {
    question_set_id: Option<String>,
    question_set_ids: Option<Vec<String>>,
    question_set_mode: Option<QuestionSetMode>,
    question_sets: Option<Vec<QuestionSetInfo>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapshotRole {
    Player,
    Admin,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::EPOCH_2026_MS;
    use crate::types::{
        AnswerOption, LEADERBOARD_DURATION_MS, MULTIPLIER_SPLASH_DURATION_MS, REVEAL_DURATION_MS,
    };

    fn answers(correct_id: &str) -> Vec<AnswerOption> {
        ["a", "b", "c", "d"]
            .into_iter()
            .map(|id| AnswerOption {
                id: id.into(),
                text: id.to_uppercase(),
                correct: id == correct_id,
            })
            .collect()
    }

    fn questions() -> Vec<Question> {
        vec![
            Question {
                id: "q1".into(),
                question: "Q1?".into(),
                answers: answers("b"),
                score: None,
                multiplier: None,
            },
            Question {
                id: "q2".into(),
                question: "Q2?".into(),
                answers: answers("a"),
                score: Some(800),
                multiplier: None,
            },
        ]
    }

    fn engine() -> GameEngine {
        GameEngine::with_clock(questions(), Clock::manual(EPOCH_2026_MS), None)
    }

    fn player_id(engine: &GameEngine, name: &str) -> String {
        engine
            .snapshot(SnapshotRole::Player, None)
            .players
            .into_iter()
            .find(|player| player.name == name)
            .unwrap()
            .id
    }

    #[test]
    fn runs_answering_reveal_leaderboard_next() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        engine.advance(30_000);
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        engine.advance(REVEAL_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.advance(LEADERBOARD_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert_eq!(engine.snapshot(SnapshotRole::Player, None).question_index, 1);
    }

    #[test]
    fn pending_points_apply_when_everyone_answers() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.join("Other", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        let points = engine.submit_answer(&join.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert_eq!(engine.get_player(&join.player.id).unwrap().score, 0);
        assert!(points > 0);
        let snap = engine.snapshot(SnapshotRole::Player, Some(&join.player.id));
        assert_eq!(snap.viewer_answer.as_ref().unwrap().correct, true);
        assert_eq!(snap.viewer_answer.unwrap().points, points);
        assert_eq!(snap.waiting_player_count, 1);
        let other = player_id(&engine, "Other");
        engine.submit_answer(&other, "a").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        assert_eq!(engine.get_player(&join.player.id).unwrap().score, points);
    }

    #[test]
    fn zero_points_for_wrong_answers() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.join("Other", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        let points = engine.submit_answer(&join.player.id, "a").unwrap();
        assert_eq!(points, 0);
        assert_eq!(engine.get_player(&join.player.id).unwrap().score, 0);
        assert!(!engine
            .snapshot(SnapshotRole::Player, Some(&join.player.id))
            .viewer_answer
            .unwrap()
            .correct);
    }

    #[test]
    fn waits_for_every_player() {
        let mut engine = engine();
        let a = engine.join("A", "s1", None).unwrap();
        let b = engine.join("B", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&a.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert_eq!(engine.get_player(&a.player.id).unwrap().score, 0);
        engine.advance(30_000);
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        assert!(engine.get_player(&a.player.id).unwrap().score > 0);
        assert_eq!(engine.get_player(&b.player.id).unwrap().score, 0);
    }

    #[test]
    fn holds_leaderboard_until_full_duration() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        engine.advance(30_000);
        engine.advance(REVEAL_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.advance(LEADERBOARD_DURATION_MS - 1);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.advance(1);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert_eq!(engine.snapshot(SnapshotRole::Player, None).question_index, 1);
    }

    #[test]
    fn multiplier_splash_before_bonus() {
        let bonus = vec![
            Question {
                id: "q1".into(),
                question: "Normal?".into(),
                answers: answers("a"),
                score: None,
                multiplier: None,
            },
            Question {
                id: "q2".into(),
                question: "Bonus?".into(),
                answers: answers("a"),
                score: None,
                multiplier: Some(3.0),
            },
        ];
        let mut engine = GameEngine::with_clock(bonus, Clock::manual(EPOCH_2026_MS), None);
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        engine.advance(30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Multiplier));
        assert_eq!(
            engine
                .snapshot(SnapshotRole::Player, None)
                .current_question
                .unwrap()
                .multiplier,
            Some(3.0)
        );
        assert!(engine
            .snapshot(SnapshotRole::Player, None)
            .question_ends_at
            .is_none());
        engine.advance(MULTIPLIER_SPLASH_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert!(engine
            .snapshot(SnapshotRole::Player, None)
            .question_ends_at
            .is_some());
        let id = player_id(&engine, "Buddy");
        assert_eq!(engine.submit_answer(&id, "a").unwrap(), 3000);
    }

    #[test]
    fn accumulates_and_resets_scores() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&join.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        let after_q1 = engine.get_player(&join.player.id).unwrap().score;
        assert!(after_q1 > 0);
        engine.advance(REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
        engine.submit_answer(&join.player.id, "a").unwrap();
        assert!(engine.get_player(&join.player.id).unwrap().score > after_q1);
        let sockets = engine.reset();
        assert_eq!(sockets, vec!["s1".to_string()]);
        assert_eq!(engine.status(), GameStatus::Waiting);
        assert!(engine.get_player(&join.player.id).is_none());
        assert!(engine.snapshot(SnapshotRole::Player, None).players.is_empty());
    }

    #[test]
    fn reset_returns_connected_sockets() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        assert_eq!(engine.reset(), vec!["s1".to_string()]);
    }

    #[test]
    fn final_leaderboard_only_for_finishers() {
        let mut engine = engine();
        let buddy = engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        let cycle = 30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS;
        engine.advance(cycle);
        engine.advance(cycle);
        assert_eq!(engine.status(), GameStatus::Finished);
        assert!(engine
            .snapshot(SnapshotRole::Player, Some(&buddy.player.id))
            .viewer_finished_game);
        let late = engine.join("Late", "s2", None).unwrap();
        assert!(!engine
            .snapshot(SnapshotRole::Player, Some(&late.player.id))
            .viewer_finished_game);
        assert!(engine
            .snapshot(SnapshotRole::Player, Some(&buddy.player.id))
            .viewer_finished_game);
    }

    #[test]
    fn same_player_id_reenters_after_reset() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.reset();
        let reenter = engine.join("Buddy", "s2", Some(&join.player.id)).unwrap();
        assert_eq!(reenter.player.id, join.player.id);
    }

    #[test]
    fn switches_question_sets_while_waiting() {
        let mut engine = engine();
        let next = vec![Question {
            id: "n1".into(),
            question: "Next?".into(),
            answers: answers("a"),
            score: None,
            multiplier: None,
        }];
        engine
            .set_questions(vec!["canada".into()], next.clone(), QuestionSetMode::Single)
            .unwrap();
        let snap = engine.snapshot(SnapshotRole::Player, None);
        assert_eq!(snap.question_set_id, "canada");
        assert_eq!(snap.question_set_ids, vec!["canada".to_string()]);
        assert_eq!(snap.total_questions, 1);
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        assert!(engine
            .set_questions(vec!["dog-facts".into()], next, QuestionSetMode::Single)
            .is_err());
    }

    #[test]
    fn pause_only_on_leaderboard() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        assert!(engine.pause().is_err());
        engine.advance(30_000 + REVEAL_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.pause().unwrap();
        assert_eq!(engine.status(), GameStatus::Paused);
        engine.advance(60_000);
        assert_eq!(engine.status(), GameStatus::Paused);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.resume().unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
    }

    #[test]
    fn late_join_keeps_remaining_time() {
        let mut engine = engine();
        engine.join("Early", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        engine.advance(10_000);
        let late = engine.join("Late", "s2", None).unwrap();
        let remaining = engine.remaining_ms();
        assert!(remaining <= 20_000);
        assert!(remaining > 0);
        assert!(engine.submit_answer(&late.player.id, "b").is_ok());
    }

    #[test]
    fn rejects_duplicate_names() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        assert!(engine.join("buddy", "s2", None).is_err());
    }

    #[test]
    fn hides_correct_until_reveal() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        let answering = engine.snapshot(SnapshotRole::Player, None);
        assert!(answering
            .current_question
            .unwrap()
            .answers
            .iter()
            .all(|answer| answer.correct.is_none()));
        engine.advance(30_000);
        let reveal = engine.snapshot(SnapshotRole::Player, None);
        assert!(reveal
            .current_question
            .unwrap()
            .answers
            .iter()
            .any(|answer| answer.correct == Some(true)));
    }

    #[test]
    fn finishes_after_last_leaderboard() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        let cycle = 30_000 + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS;
        engine.advance(cycle);
        engine.advance(cycle);
        assert_eq!(engine.status(), GameStatus::Finished);
    }

    #[test]
    fn ejects_from_quiz_without_clearing_score() {
        let mut engine = engine();
        let ada = engine.join("Ada", "s1", None).unwrap();
        let bea = engine.join("Bea", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&ada.player.id, "b").unwrap();
        engine.submit_answer(&bea.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        let bea_score = engine.get_player(&bea.player.id).unwrap().score;
        assert!(bea_score > 0);
        engine.advance(REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        engine.eject(&bea.player.id).unwrap();
        assert_eq!(engine.get_player(&bea.player.id).unwrap().score, bea_score);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert!(engine.submit_answer(&bea.player.id, "a").is_err());
        engine.submit_answer(&ada.player.id, "a").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        assert_eq!(engine.get_player(&bea.player.id).unwrap().score, bea_score);
        assert!(engine.get_player(&ada.player.id).unwrap().score > bea_score);
    }

    #[test]
    fn kicks_a_player() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.kick(&join.player.id).unwrap();
        assert!(engine.get_player(&join.player.id).is_none());
    }

    #[test]
    fn kicking_last_unanswered_player_reveals() {
        let mut engine = engine();
        let a = engine.join("Ada", "s1", None).unwrap();
        let b = engine.join("Bea", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&a.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        engine.kick(&b.player.id).unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        assert!(engine.get_player(&a.player.id).unwrap().score > 0);
        assert!(engine.get_player(&b.player.id).is_none());
    }

    #[test]
    fn advances_when_all_connected_answer() {
        let mut engine = engine();
        let a = engine.join("A", "s1", None).unwrap();
        let b = engine.join("B", "s2", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&a.player.id, "b").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
        assert_eq!(engine.get_player(&a.player.id).unwrap().score, 0);
        engine.submit_answer(&b.player.id, "a").unwrap();
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        assert!(engine.get_player(&a.player.id).unwrap().score > 0);
    }

    #[test]
    fn preserves_score_on_rejoin() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        engine.start(0.0).unwrap();
        engine.submit_answer(&join.player.id, "b").unwrap();
        let score = engine.get_player(&join.player.id).unwrap().score;
        assert!(score > 0);
        engine.mark_disconnected("s1");
        assert!(!engine.get_player(&join.player.id).unwrap().connected);
        let rejoin = engine.join("Buddy", "s2", Some(&join.player.id)).unwrap();
        assert_eq!(rejoin.player.score, score);
        assert!(rejoin.player.connected);
    }

    #[test]
    fn rejects_second_live_connection() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        assert!(engine.join("Buddy", "s2", None).is_err());
    }

    #[test]
    fn takeover_reports_replaced_socket() {
        let mut engine = engine();
        let join = engine.join("Buddy", "s1", None).unwrap();
        let takeover = engine.join("Buddy", "s2", Some(&join.player.id)).unwrap();
        assert_eq!(takeover.replaced_socket_id.as_deref(), Some("s1"));
        assert_eq!(
            engine.get_player(&join.player.id).unwrap().socket_id.as_deref(),
            Some("s2")
        );
    }

    #[test]
    fn schedules_delayed_start() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine.start(1.0).unwrap();
        assert_eq!(engine.status(), GameStatus::Waiting);
        assert!(engine
            .snapshot(SnapshotRole::Player, None)
            .scheduled_start_at
            .is_some());
        engine.advance(60_000);
        assert_eq!(engine.status(), GameStatus::Active);
        assert!(engine
            .snapshot(SnapshotRole::Player, None)
            .scheduled_start_at
            .is_none());
    }

    #[test]
    fn configurable_phase_durations() {
        let mut engine = engine();
        engine.join("Buddy", "s1", None).unwrap();
        engine
            .update_config(&GameConfig {
                time_limit_seconds: 30,
                default_score: 1000,
                min_score: 100,
                scale_ms: 100,
                reveal_duration_ms: 1_000,
                leaderboard_duration_ms: 1_500,
            })
            .unwrap();
        engine.start(0.0).unwrap();
        engine.advance(30_000);
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        engine.advance(999);
        assert_eq!(engine.phase(), Some(GamePhase::Reveal));
        engine.advance(1);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.advance(1_499);
        assert_eq!(engine.phase(), Some(GamePhase::Leaderboard));
        engine.advance(1);
        assert_eq!(engine.phase(), Some(GamePhase::Answering));
    }

    #[test]
    fn continuous_sets_keep_running_score_shape() {
        let mut engine = engine();
        let extra = Question {
            id: "pack2:q1".into(),
            question: "Extra?".into(),
            answers: answers("a"),
            score: None,
            multiplier: None,
        };
        let mut combined = questions();
        combined.push(extra);
        engine
            .set_questions(
                vec!["dog-facts".into(), "cat-facts".into()],
                combined,
                QuestionSetMode::Continuous,
            )
            .unwrap();
        let snap = engine.snapshot(SnapshotRole::Player, None);
        assert_eq!(snap.total_questions, 3);
        assert_eq!(snap.question_set_mode, QuestionSetMode::Continuous);
    }
}
