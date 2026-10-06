use indexmap::IndexMap;
use rand::seq::SliceRandom;

use crate::clock::Clock;
use crate::word_survivor::{
    length_at, mark_guess, score_word, TileMark, WordLists, WordSurvivorAdminEntry,
    WordSurvivorAdminSnapshot, WordSurvivorFileInfo, WordSurvivorGuess, WordSurvivorPhase,
    WordSurvivorPlayerSnapshot, DEFAULT_SPLASH_MS, MAX_GUESSES, MAX_SPLASH_MS, MIN_SPLASH_MS,
    REVEAL_MS, TOPIC_MAX_CHARS, WORDS_PER_LENGTH, WORD_COUNT,
};

struct PlayerProgress {
    name: String,
    words: Vec<String>,
    index: usize,
    guesses: Vec<WordSurvivorGuess>,
    draft: String,
    score: i64,
    phase: WordSurvivorPhase,
    splash_until: Option<i64>,
    reveal_until: Option<i64>,
    words_cleared: i64,
    elapsed_ms: i64,
    active_since: Option<i64>,
    timer_started: bool,
    completed_at: Option<i64>,
}

fn normalize_letter(letter: &str) -> Result<char, String> {
    let mut chars = letter.chars();
    let Some(ch) = chars.next() else {
        return Err("Enter a letter".into());
    };
    if chars.next().is_some() || !ch.is_ascii_alphabetic() {
        return Err("Enter a letter".into());
    }
    Ok(ch.to_ascii_uppercase())
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

pub struct WordSurvivorEngine {
    lists: WordLists,
    file_id: String,
    catalog: Vec<WordSurvivorFileInfo>,
    topic: String,
    /// When false, each run takes the first words in file order. Tests use this.
    shuffle: bool,
    players: IndexMap<String, PlayerProgress>,
    splash_ms: i64,
    load_error: Option<String>,
    clock: Clock,
}

impl WordSurvivorEngine {
    pub fn new(lists: WordLists) -> Self {
        Self::with_clock(lists, Clock::system())
    }

    pub fn with_clock(lists: WordLists, clock: Clock) -> Self {
        Self::build(lists, clock, true)
    }

    pub fn in_order(lists: WordLists, clock: Clock) -> Self {
        Self::build(lists, clock, false)
    }

    fn build(lists: WordLists, clock: Clock, shuffle: bool) -> Self {
        Self {
            lists,
            file_id: "words".to_string(),
            catalog: Vec::new(),
            topic: String::new(),
            shuffle,
            players: IndexMap::new(),
            splash_ms: DEFAULT_SPLASH_MS,
            load_error: None,
            clock,
        }
    }

    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    pub fn file_id(&self) -> &str {
        &self.file_id
    }

    pub fn set_catalog(&mut self, catalog: Vec<WordSurvivorFileInfo>) {
        self.catalog = catalog;
    }

    pub fn use_file(&mut self, file_id: String, catalog: Vec<WordSurvivorFileInfo>) {
        self.file_id = file_id;
        self.catalog = catalog;
    }

    pub fn apply_selection(
        &mut self,
        file_id: String,
        lists: WordLists,
        topic: &str,
    ) -> Result<(), String> {
        let topic = topic.trim();
        if topic.chars().count() > TOPIC_MAX_CHARS {
            return Err(format!(
                "Topic must be {TOPIC_MAX_CHARS} characters or fewer"
            ));
        }
        self.file_id = file_id;
        self.lists = lists;
        self.topic = topic.to_string();
        self.load_error = None;
        Ok(())
    }

    pub fn replace_lists(&mut self, lists: WordLists) {
        self.lists = lists;
        self.load_error = None;
    }

    pub fn note_load_error(&mut self, error: String) {
        self.load_error = Some(error);
    }

    pub fn set_splash_ms(&mut self, splash_ms: i64) -> Result<(), String> {
        if !(MIN_SPLASH_MS..=MAX_SPLASH_MS).contains(&splash_ms) || splash_ms % 1_000 != 0 {
            return Err("Splash must be a whole number of seconds from 1 to 10".into());
        }
        self.splash_ms = splash_ms;
        Ok(())
    }

    pub fn has_player(&self, player_id: &str) -> bool {
        self.players.contains_key(player_id)
    }

    pub fn ensure_player(&mut self, player_id: &str, name: &str) {
        if let Some(existing) = self.players.get_mut(player_id) {
            existing.name = name.to_string();
            return;
        }
        self.players
            .insert(player_id.to_string(), self.fresh(name.to_string()));
    }

    pub fn campaign(&self, player_id: &str) -> Option<&[String]> {
        self.players
            .get(player_id)
            .map(|player| player.words.as_slice())
    }

    pub fn ack_intro(&mut self, player_id: &str) -> Result<(), String> {
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Player not found".into());
        };
        if player.phase == WordSurvivorPhase::Intro {
            player.phase = WordSurvivorPhase::Playing;
        }
        Ok(())
    }

    pub fn type_letter(&mut self, player_id: &str, letter: &str) -> Result<(), String> {
        let now = self.now();
        self.sync_player(player_id, now);
        let letter = normalize_letter(letter)?;
        let length = self.current_length(player_id)?;
        let player = self.player_mut(player_id)?;
        Self::require_playing(player)?;
        if player.draft.chars().count() >= length as usize {
            return Err("That word is full".into());
        }
        player.draft.push(letter);
        Self::note_letter(player, now);
        Ok(())
    }

    pub fn backspace(&mut self, player_id: &str) -> Result<(), String> {
        let now = self.now();
        self.sync_player(player_id, now);
        let player = self.player_mut(player_id)?;
        Self::require_playing(player)?;
        player.draft.pop();
        Ok(())
    }

    pub fn submit(&mut self, player_id: &str) -> Result<(), String> {
        let now = self.now();
        self.sync_player(player_id, now);
        let length = self.current_length(player_id)?;
        let player = self.player_mut(player_id)?;
        Self::require_playing(player)?;
        if player.draft.chars().count() != length as usize {
            return Err("Finish the word first".into());
        }
        let guess = std::mem::take(&mut player.draft);
        let answer = player.words[player.index].clone();
        if guess == answer {
            let used = player.guesses.len() as i64 + 1;
            player.score += score_word(used);
            player.words_cleared += 1;
            player.guesses.push(WordSurvivorGuess {
                marks: vec![TileMark::Correct; guess.chars().count()],
                word: guess,
            });
            player.phase = WordSurvivorPhase::Reveal;
            player.reveal_until = Some(now + REVEAL_MS);
            Self::pause_clock(player, now);
            return Ok(());
        }
        player.guesses.push(WordSurvivorGuess {
            marks: mark_guess(&guess, &answer),
            word: guess,
        });
        if player.guesses.len() as i64 >= MAX_GUESSES {
            player.phase = WordSurvivorPhase::Lost;
            Self::freeze(player, now);
        }
        Ok(())
    }

    pub fn pause_timer(&mut self, player_id: &str) {
        let now = self.now();
        self.sync_player(player_id, now);
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        Self::pause_clock(player, now);
    }

    pub fn resume_timer(&mut self, player_id: &str) {
        let now = self.now();
        self.sync_player(player_id, now);
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if !player.timer_started
            || player.completed_at.is_some()
            || player.active_since.is_some()
            || player.phase != WordSurvivorPhase::Playing
        {
            return;
        }
        player.active_since = Some(now);
    }

    pub fn player_snapshot(&self, player_id: &str) -> Option<WordSurvivorPlayerSnapshot> {
        let now = self.now();
        let player = self.players.get(player_id)?;
        let answer = if player.phase == WordSurvivorPhase::Lost {
            player.words.get(player.index).cloned()
        } else {
            None
        };
        Some(WordSurvivorPlayerSnapshot {
            word_number: player.index as i64 + 1,
            word_count: WORD_COUNT,
            length: length_at(player.index),
            guesses: player.guesses.clone(),
            draft: player.draft.clone(),
            score: player.score,
            phase: player.phase,
            topic: self.topic.clone(),
            splash_until: player.splash_until,
            reveal_until: player.reveal_until,
            words_cleared: player.words_cleared,
            max_guesses: MAX_GUESSES,
            elapsed_ms: current_elapsed_ms(
                player.elapsed_ms,
                player.active_since,
                player.completed_at,
                now,
            ),
            active_since: player.active_since,
            completed_at: player.completed_at,
            answer,
        })
    }

    pub fn admin_snapshot(&self) -> WordSurvivorAdminSnapshot {
        let now = self.now();
        let mut players: Vec<WordSurvivorAdminEntry> = self
            .players
            .iter()
            .map(|(player_id, player)| WordSurvivorAdminEntry {
                player_id: player_id.clone(),
                name: player.name.clone(),
                score: player.score,
                word_number: player.index as i64 + 1,
                length: length_at(player.index),
                phase: player.phase,
                words_cleared: player.words_cleared,
                elapsed_ms: current_elapsed_ms(
                    player.elapsed_ms,
                    player.active_since,
                    player.completed_at,
                    now,
                ),
                active_since: player.active_since,
                completed_at: player.completed_at,
            })
            .collect();
        players.sort_by(|left, right| {
            right.score.cmp(&left.score).then_with(|| {
                Self::sort_elapsed(left, now)
                    .cmp(&Self::sort_elapsed(right, now))
                    .then_with(|| left.name.cmp(&right.name))
            })
        });
        WordSurvivorAdminSnapshot {
            splash_ms: self.splash_ms,
            file_id: self.file_id.clone(),
            topic: self.topic.clone(),
            files: self.catalog.clone(),
            counts: self.lists.counts(),
            load_error: self.load_error.clone(),
            players,
        }
    }

    pub fn reset_player(&mut self, player_id: &str) -> Result<(), String> {
        let name = self
            .players
            .get(player_id)
            .map(|player| player.name.clone())
            .ok_or_else(|| "Player not found".to_string())?;
        let fresh = self.fresh(name);
        if let Some(player) = self.players.get_mut(player_id) {
            *player = fresh;
        }
        Ok(())
    }

    pub fn reset(&mut self) {
        let names: Vec<(String, String)> = self
            .players
            .iter()
            .map(|(id, player)| (id.clone(), player.name.clone()))
            .collect();
        for (player_id, name) in names {
            let fresh = self.fresh(name);
            if let Some(player) = self.players.get_mut(&player_id) {
                *player = fresh;
            }
        }
    }

    pub fn remove_player(&mut self, player_id: &str) {
        self.players.shift_remove(player_id);
    }

    pub fn clear_players(&mut self) {
        self.players.clear();
    }

    fn fresh(&self, name: String) -> PlayerProgress {
        PlayerProgress {
            name,
            words: self.pick_campaign(),
            index: 0,
            guesses: Vec::new(),
            draft: String::new(),
            score: 0,
            phase: WordSurvivorPhase::Intro,
            splash_until: None,
            reveal_until: None,
            words_cleared: 0,
            elapsed_ms: 0,
            active_since: None,
            timer_started: false,
            completed_at: None,
        }
    }

    fn pick_campaign(&self) -> Vec<String> {
        let mut words = Vec::with_capacity(WORD_COUNT as usize);
        let mut rng = rand::rng();
        for length in [5, 6, 7, 8, 9] {
            let pool = self.lists.words(length);
            let mut indexes: Vec<usize> = (0..pool.len()).collect();
            if self.shuffle {
                indexes.shuffle(&mut rng);
            }
            for index in indexes.into_iter().take(WORDS_PER_LENGTH) {
                words.push(pool[index].clone());
            }
        }
        words
    }

    fn now(&self) -> i64 {
        self.clock.now()
    }

    fn current_length(&self, player_id: &str) -> Result<i64, String> {
        let player = self
            .players
            .get(player_id)
            .ok_or_else(|| "Player not found".to_string())?;
        Ok(length_at(player.index))
    }

    fn player_mut(&mut self, player_id: &str) -> Result<&mut PlayerProgress, String> {
        self.players
            .get_mut(player_id)
            .ok_or_else(|| "Player not found".to_string())
    }

    fn require_playing(player: &PlayerProgress) -> Result<(), String> {
        match player.phase {
            WordSurvivorPhase::Intro => Err("Press OK to start".into()),
            WordSurvivorPhase::Reveal | WordSurvivorPhase::Splash => {
                Err("Wait for the next word".into())
            }
            WordSurvivorPhase::Won | WordSurvivorPhase::Lost => Err("The game is over".into()),
            WordSurvivorPhase::Playing => Ok(()),
        }
    }

    fn sync_player(&mut self, player_id: &str, now: i64) {
        let splash_ms = self.splash_ms;
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if player.phase == WordSurvivorPhase::Reveal
            && player.reveal_until.is_some_and(|until| now >= until)
        {
            player.reveal_until = None;
            player.guesses.clear();
            player.draft.clear();
            if player.words_cleared >= WORD_COUNT {
                player.phase = WordSurvivorPhase::Won;
                Self::freeze(player, now);
                return;
            }
            player.index += 1;
            player.phase = WordSurvivorPhase::Splash;
            player.splash_until = Some(now + splash_ms);
            return;
        }
        if player.phase == WordSurvivorPhase::Splash
            && player.splash_until.is_some_and(|until| now >= until)
        {
            player.phase = WordSurvivorPhase::Playing;
            player.splash_until = None;
        }
    }

    fn note_letter(player: &mut PlayerProgress, now: i64) {
        if player.completed_at.is_some() {
            return;
        }
        if !player.timer_started {
            player.timer_started = true;
            player.active_since = Some(now);
            return;
        }
        if player.active_since.is_none() {
            player.active_since = Some(now);
        }
    }

    fn pause_clock(player: &mut PlayerProgress, now: i64) {
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

    fn freeze(player: &mut PlayerProgress, now: i64) {
        player.elapsed_ms = current_elapsed_ms(
            player.elapsed_ms,
            player.active_since,
            player.completed_at,
            now,
        );
        player.active_since = None;
        player.completed_at = Some(now);
        player.splash_until = None;
        player.reveal_until = None;
    }

    fn sort_elapsed(player: &WordSurvivorAdminEntry, now: i64) -> i64 {
        if player.phase == WordSurvivorPhase::Intro
            && player.active_since.is_none()
            && player.elapsed_ms == 0
        {
            return i64::MAX;
        }
        current_elapsed_ms(
            player.elapsed_ms,
            player.active_since,
            player.completed_at,
            now,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::word_survivor::{sample_word_lists, TileMark, DEFAULT_SPLASH_MS, REVEAL_MS};

    fn engine(start: i64) -> WordSurvivorEngine {
        WordSurvivorEngine::in_order(sample_word_lists(), Clock::manual(start))
    }

    fn type_word(engine: &mut WordSurvivorEngine, player_id: &str, word: &str) {
        for letter in word.chars() {
            engine.type_letter(player_id, &letter.to_string()).unwrap();
        }
        engine.submit(player_id).unwrap();
    }

    #[test]
    fn run_uses_each_length_five_times_without_repeats() {
        let mut game = engine(0);
        game.ensure_player("p1", "Ada");
        let words = game.campaign("p1").unwrap();
        assert_eq!(words.len(), 25);
        let unique: std::collections::HashSet<_> = words.iter().collect();
        assert_eq!(unique.len(), 25);
        for (index, word) in words.iter().enumerate() {
            assert_eq!(word.chars().count() as i64, length_at(index));
        }
        let first = game.lists.words(5)[0].clone();
        assert_eq!(words[0], first);
    }

    #[test]
    fn letters_fill_left_to_right_and_backspace_removes_the_last() {
        let mut game = engine(1_000);
        game.ensure_player("p1", "Ada");
        assert_eq!(
            game.type_letter("p1", "A").unwrap_err(),
            "Press OK to start"
        );
        game.ack_intro("p1").unwrap();
        game.type_letter("p1", "a").unwrap();
        game.type_letter("p1", "b").unwrap();
        game.backspace("p1").unwrap();
        let snap = game.player_snapshot("p1").unwrap();
        assert_eq!(snap.draft, "A");
        assert!(snap.answer.is_none());
        assert!(snap.active_since.is_some());
        game.clock().set(1_040);
        assert_eq!(game.player_snapshot("p1").unwrap().elapsed_ms, 40);
    }

    #[test]
    fn a_correct_word_scores_and_opens_the_next_splash() {
        let mut game = engine(2_000);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        let answer = game.campaign("p1").unwrap()[0].clone();
        let miss = if answer == "AAAAA" {
            "BBBBB"
        } else {
            "AAAAA"
        };
        type_word(&mut game, "p1", miss);
        type_word(&mut game, "p1", &answer);
        let revealed = game.player_snapshot("p1").unwrap();
        assert_eq!(revealed.phase, WordSurvivorPhase::Reveal);
        assert_eq!(revealed.score, 115);
        assert_eq!(revealed.word_number, 1);
        assert_eq!(revealed.guesses.len(), 2);
        assert_eq!(revealed.guesses[0].word, miss);
        assert_eq!(revealed.guesses[1].word, answer);
        assert!(revealed.guesses[1]
            .marks
            .iter()
            .all(|mark| *mark == TileMark::Correct));
        assert!(revealed.active_since.is_none());
        assert_eq!(
            game.type_letter("p1", "A").unwrap_err(),
            "Wait for the next word"
        );
        game.clock().set(2_000 + REVEAL_MS);
        game.resume_timer("p1");
        let splash = game.player_snapshot("p1").unwrap();
        assert_eq!(splash.phase, WordSurvivorPhase::Splash);
        assert_eq!(splash.word_number, 2);
        assert_eq!(splash.length, 5);
        assert!(splash.guesses.is_empty());
        // An early nudge must not clear the splash; later nudges still advance.
        game.resume_timer("p1");
        assert_eq!(
            game.player_snapshot("p1").unwrap().phase,
            WordSurvivorPhase::Splash
        );
        game.clock().set(2_000 + REVEAL_MS + DEFAULT_SPLASH_MS);
        game.resume_timer("p1");
        assert_eq!(
            game.player_snapshot("p1").unwrap().phase,
            WordSurvivorPhase::Playing
        );
    }

    #[test]
    fn pause_after_the_splash_deadline_still_opens_the_next_word() {
        let mut game = engine(2_000);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        let answer = game.campaign("p1").unwrap()[0].clone();
        type_word(&mut game, "p1", &answer);
        game.clock().set(2_000 + REVEAL_MS);
        game.resume_timer("p1");
        assert_eq!(
            game.player_snapshot("p1").unwrap().phase,
            WordSurvivorPhase::Splash
        );
        game.clock().set(2_000 + REVEAL_MS + DEFAULT_SPLASH_MS);
        game.pause_timer("p1");
        assert_eq!(
            game.player_snapshot("p1").unwrap().phase,
            WordSurvivorPhase::Playing
        );
    }

    #[test]
    fn the_fifth_miss_ends_the_run_and_reveals_the_word() {
        let mut game = engine(3_000);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        let answer = game.campaign("p1").unwrap()[0].clone();
        for _ in 0..4 {
            type_word(&mut game, "p1", "ZZZZZ");
            assert_eq!(
                game.player_snapshot("p1").unwrap().phase,
                WordSurvivorPhase::Playing
            );
        }
        type_word(&mut game, "p1", "YYYYY");
        let lost = game.player_snapshot("p1").unwrap();
        assert_eq!(lost.phase, WordSurvivorPhase::Lost);
        assert_eq!(lost.score, 0);
        assert_eq!(lost.answer.as_deref(), Some(answer.as_str()));
        assert_eq!(lost.guesses[0].marks[0], TileMark::Absent);
        assert!(lost.completed_at.is_some());
        assert_eq!(game.type_letter("p1", "A").unwrap_err(), "The game is over");
    }

    #[test]
    fn solving_on_the_last_guess_still_scores_the_word() {
        let mut game = engine(4_000);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        let answer = game.campaign("p1").unwrap()[0].clone();
        for _ in 0..4 {
            type_word(&mut game, "p1", "ZZZZZ");
        }
        type_word(&mut game, "p1", &answer);
        let snap = game.player_snapshot("p1").unwrap();
        assert_eq!(snap.score, 100);
        assert_eq!(snap.phase, WordSurvivorPhase::Reveal);
        assert_eq!(snap.words_cleared, 1);
        assert_eq!(snap.guesses.len(), 5);
        assert!(snap.guesses[4]
            .marks
            .iter()
            .all(|mark| *mark == TileMark::Correct));
    }

    #[test]
    fn clearing_every_word_wins() {
        let mut game = engine(5_000);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        let words: Vec<String> = game.campaign("p1").unwrap().to_vec();
        let mut now = 5_000;
        for (index, word) in words.iter().enumerate() {
            if index > 0 {
                now += REVEAL_MS;
                game.clock().set(now);
                game.resume_timer("p1");
                now += DEFAULT_SPLASH_MS;
                game.clock().set(now);
                game.resume_timer("p1");
            }
            type_word(&mut game, "p1", word);
        }
        now += REVEAL_MS;
        game.clock().set(now);
        game.resume_timer("p1");
        let won = game.player_snapshot("p1").unwrap();
        assert_eq!(won.phase, WordSurvivorPhase::Won);
        assert_eq!(won.score, 25 * 120);
        assert_eq!(won.words_cleared, 25);
        assert!(won.completed_at.is_some());
        assert!(won.answer.is_none());
    }

    #[test]
    fn pause_holds_the_clock_until_play_resumes() {
        let mut game = engine(0);
        game.ensure_player("p1", "Ada");
        game.ack_intro("p1").unwrap();
        game.type_letter("p1", "A").unwrap();
        game.clock().set(40);
        game.pause_timer("p1");
        assert_eq!(game.player_snapshot("p1").unwrap().elapsed_ms, 40);
        game.clock().set(90);
        assert_eq!(game.player_snapshot("p1").unwrap().elapsed_ms, 40);
        game.resume_timer("p1");
        game.clock().set(110);
        assert_eq!(game.player_snapshot("p1").unwrap().elapsed_ms, 60);
    }

    #[test]
    fn ranks_by_score_then_time_and_reset_starts_over() {
        let mut game = engine(0);
        game.ensure_player("slow", "Slow");
        game.ensure_player("idle", "Idle");
        game.ensure_player("fast", "Fast");
        game.ack_intro("fast").unwrap();
        game.ack_intro("slow").unwrap();
        let answer = game.campaign("fast").unwrap()[0].clone();
        type_word(&mut game, "fast", &answer);
        game.clock().set(30);
        type_word(&mut game, "slow", &answer);
        let board = game.admin_snapshot();
        let names: Vec<_> = board
            .players
            .iter()
            .map(|player| player.name.as_str())
            .collect();
        assert_eq!(names, ["Fast", "Slow", "Idle"]);
        game.reset_player("fast").unwrap();
        let reset = game.player_snapshot("fast").unwrap();
        assert_eq!(reset.phase, WordSurvivorPhase::Intro);
        assert_eq!(reset.score, 0);
        assert_eq!(reset.word_number, 1);
        assert_eq!(
            game.set_splash_ms(500).unwrap_err(),
            "Splash must be a whole number of seconds from 1 to 10"
        );
        game.set_splash_ms(4_000).unwrap();
        assert_eq!(game.admin_snapshot().splash_ms, 4_000);
    }

    #[test]
    fn shuffled_runs_stay_in_length_order() {
        let mut game = WordSurvivorEngine::with_clock(sample_word_lists(), Clock::manual(0));
        game.ensure_player("p1", "Ada");
        let words = game.campaign("p1").unwrap();
        assert_eq!(words.len(), 25);
        for (index, word) in words.iter().enumerate() {
            assert_eq!(word.chars().count() as i64, length_at(index));
        }
    }
}
