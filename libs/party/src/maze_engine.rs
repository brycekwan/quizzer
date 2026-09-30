use indexmap::IndexMap;

use crate::clock::Clock;
use crate::maze::{
    cell_open, in_bounds, maze_campaign_score, to_public_maze, validate_maze_file, walls_at,
    MazeAdminEntry, MazeAdminSnapshot, MazeCellRef, MazeDifficulty, MazeDirection, MazeFile,
    MazeLevelChoice, MazePhase, MazePlayerSnapshot, MazePublicPuzzle, MazePuzzleInfo, MAZE_LIVES,
    MAZE_SPLASH_MS,
};

struct LevelSlot {
    puzzle: MazeFile,
    public_puzzle: MazePublicPuzzle,
    pending_id: String,
    catalog: Vec<MazePuzzleInfo>,
}

struct PlayerProgress {
    name: String,
    level: MazeDifficulty,
    position: MazeCellRef,
    visited: Vec<MazeCellRef>,
    lives: i64,
    levels_cleared: i64,
    phase: MazePhase,
    splash_until: Option<i64>,
    elapsed_ms: i64,
    active_since: Option<i64>,
    timer_started: bool,
    completed_at: Option<i64>,
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

pub struct MazeEngine {
    easy: LevelSlot,
    medium: LevelSlot,
    hard: LevelSlot,
    players: IndexMap<String, PlayerProgress>,
    clock: Clock,
}

impl MazeEngine {
    pub fn new(easy: MazeFile, medium: MazeFile, hard: MazeFile) -> Result<Self, String> {
        Self::with_clock(easy, medium, hard, None, None, None, Clock::system())
    }

    pub fn with_clock(
        easy: MazeFile,
        medium: MazeFile,
        hard: MazeFile,
        easy_catalog: Option<Vec<MazePuzzleInfo>>,
        medium_catalog: Option<Vec<MazePuzzleInfo>>,
        hard_catalog: Option<Vec<MazePuzzleInfo>>,
        clock: Clock,
    ) -> Result<Self, String> {
        Ok(Self {
            easy: LevelSlot::new(easy, MazeDifficulty::Easy, easy_catalog)?,
            medium: LevelSlot::new(medium, MazeDifficulty::Medium, medium_catalog)?,
            hard: LevelSlot::new(hard, MazeDifficulty::Hard, hard_catalog)?,
            players: IndexMap::new(),
            clock,
        })
    }

    pub fn clock(&self) -> &Clock {
        &self.clock
    }

    fn now(&self) -> i64 {
        self.clock.now()
    }

    pub fn active_id(&self, difficulty: MazeDifficulty) -> &str {
        &self.slot(difficulty).puzzle.id
    }

    pub fn pending_id(&self, difficulty: MazeDifficulty) -> &str {
        &self.slot(difficulty).pending_id
    }

    pub fn set_catalog(&mut self, difficulty: MazeDifficulty, catalog: Vec<MazePuzzleInfo>) {
        self.slot_mut(difficulty).catalog = catalog;
    }

    pub fn select_puzzle(
        &mut self,
        difficulty: MazeDifficulty,
        puzzle_id: &str,
    ) -> Result<(), String> {
        let slot = self.slot_mut(difficulty);
        if !slot.catalog.iter().any(|puzzle| puzzle.id == puzzle_id) {
            return Err("Maze not found".into());
        }
        slot.pending_id = puzzle_id.to_string();
        Ok(())
    }

    pub fn set_puzzle(
        &mut self,
        difficulty: MazeDifficulty,
        puzzle: MazeFile,
    ) -> Result<(), String> {
        if let Some(error) = validate_maze_file(&puzzle, difficulty) {
            return Err(error);
        }
        let slot = self.slot_mut(difficulty);
        slot.public_puzzle = to_public_maze(&puzzle, difficulty);
        slot.pending_id = puzzle.id.clone();
        slot.puzzle = puzzle;
        Ok(())
    }

    pub fn ensure_player(&mut self, player_id: &str, name: &str) {
        if let Some(existing) = self.players.get_mut(player_id) {
            existing.name = name.to_string();
            return;
        }
        self.players
            .insert(player_id.to_string(), self.fresh(name.to_string()));
    }

    pub fn ack_intro(&mut self, player_id: &str) -> Result<(), String> {
        let now = self.now();
        let Some(player) = self.players.get_mut(player_id) else {
            return Err("Player not found".into());
        };
        if player.phase != MazePhase::Intro {
            return Ok(());
        }
        player.phase = MazePhase::Splash;
        player.splash_until = Some(now + MAZE_SPLASH_MS);
        Ok(())
    }

    pub fn move_player(&mut self, player_id: &str, direction: MazeDirection) -> Result<(), String> {
        let now = self.now();
        self.sync_player(player_id, now);
        let puzzle = self.current_puzzle(player_id)?.clone();
        let player = self
            .players
            .get_mut(player_id)
            .ok_or_else(|| "Player not found".to_string())?;
        if player.phase == MazePhase::Intro {
            return Err("Press OK to start".into());
        }
        if player.phase == MazePhase::Won || player.phase == MazePhase::Lost {
            return Err("The maze is over".into());
        }
        if player.phase == MazePhase::Splash {
            return Err("Wait for the next maze".into());
        }
        let (dr, dc) = direction.delta();
        let next = MazeCellRef {
            row: player.position.row + dr,
            col: player.position.col + dc,
        };
        if !in_bounds(next, puzzle.rows)
            || !cell_open(&puzzle, next)
            || walls_at(&puzzle, player.position).blocked(direction)
            || walls_at(&puzzle, next).blocked(direction.opposite())
        {
            return Err("That way is blocked".into());
        }
        if player.visited.contains(&next) {
            return Err("You cannot go back".into());
        }
        player.visited.push(next);
        player.position = next;
        Self::note_move(player, now);
        let mut placed_on = None;
        if next == puzzle.target {
            let level = player.level;
            if level.next().is_none() {
                player.levels_cleared = 3;
                player.phase = MazePhase::Won;
                Self::freeze(player, now);
            } else {
                let next_level = level.next().expect("next level");
                player.levels_cleared += 1;
                player.level = next_level;
                player.phase = MazePhase::Splash;
                player.splash_until = Some(now + MAZE_SPLASH_MS);
                Self::pause_clock(player, now);
                placed_on = Some(next_level);
            }
        }
        if let Some(level) = placed_on {
            let start = self.slot(level).puzzle.start;
            let player = self
                .players
                .get_mut(player_id)
                .expect("player still present");
            player.position = start;
            player.visited = vec![start];
        }
        Ok(())
    }

    pub fn restart(&mut self, player_id: &str) -> Result<(), String> {
        let now = self.now();
        self.sync_player(player_id, now);
        let start = self.current_puzzle(player_id)?.start;
        let player = self
            .players
            .get_mut(player_id)
            .ok_or_else(|| "Player not found".to_string())?;
        if player.phase != MazePhase::Playing {
            return Err("The maze is not in play".into());
        }
        if player.lives <= 1 {
            player.lives = 0;
            player.phase = MazePhase::Lost;
            Self::freeze(player, now);
            return Ok(());
        }
        player.lives -= 1;
        player.position = start;
        player.visited = vec![start];
        Ok(())
    }

    pub fn pause_timer(&mut self, player_id: &str) {
        let now = self.now();
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
            || player.phase != MazePhase::Playing
        {
            return;
        }
        player.active_since = Some(now);
    }

    pub fn player_snapshot(&self, player_id: &str) -> Option<MazePlayerSnapshot> {
        let now = self.now();
        let player = self.players.get(player_id)?;
        let level = player.level;
        let puzzle = self.slot(level).public_puzzle.clone();
        let score = maze_campaign_score(player.levels_cleared, player.lives, player.phase);
        let elapsed_ms = current_elapsed_ms(
            player.elapsed_ms,
            player.active_since,
            player.completed_at,
            now,
        );
        Some(MazePlayerSnapshot {
            level,
            puzzle,
            position: player.position,
            visited: player.visited.clone(),
            lives: player.lives,
            score,
            phase: player.phase,
            splash_until: player.splash_until,
            levels_cleared: player.levels_cleared,
            elapsed_ms,
            active_since: player.active_since,
            completed_at: player.completed_at,
        })
    }

    pub fn admin_snapshot(&self) -> MazeAdminSnapshot {
        let now = self.now();
        let mut players: Vec<MazeAdminEntry> = self
            .players
            .iter()
            .map(|(player_id, player)| {
                let elapsed_ms = current_elapsed_ms(
                    player.elapsed_ms,
                    player.active_since,
                    player.completed_at,
                    now,
                );
                MazeAdminEntry {
                    player_id: player_id.clone(),
                    name: player.name.clone(),
                    score: maze_campaign_score(player.levels_cleared, player.lives, player.phase),
                    level: player.level,
                    lives: player.lives,
                    phase: player.phase,
                    elapsed_ms,
                    active_since: player.active_since,
                    completed_at: player.completed_at,
                }
            })
            .collect();
        players.sort_by(|left, right| {
            right.score.cmp(&left.score).then_with(|| {
                Self::sort_elapsed(left, now)
                    .cmp(&Self::sort_elapsed(right, now))
                    .then_with(|| left.name.cmp(&right.name))
            })
        });
        MazeAdminSnapshot {
            easy: self.easy.choice(),
            medium: self.medium.choice(),
            hard: self.hard.choice(),
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
        let start = self.easy.puzzle.start;
        PlayerProgress {
            name,
            level: MazeDifficulty::Easy,
            position: start,
            visited: vec![start],
            lives: MAZE_LIVES,
            levels_cleared: 0,
            phase: MazePhase::Intro,
            splash_until: None,
            elapsed_ms: 0,
            active_since: None,
            timer_started: false,
            completed_at: None,
        }
    }

    fn sync_player(&mut self, player_id: &str, now: i64) {
        let Some(player) = self.players.get_mut(player_id) else {
            return;
        };
        if player.phase == MazePhase::Splash
            && player.splash_until.is_some_and(|until| now >= until)
        {
            player.phase = MazePhase::Playing;
            player.splash_until = None;
        }
    }

    fn current_puzzle(&self, player_id: &str) -> Result<&MazeFile, String> {
        let player = self
            .players
            .get(player_id)
            .ok_or_else(|| "Player not found".to_string())?;
        Ok(&self.slot(player.level).puzzle)
    }

    fn note_move(player: &mut PlayerProgress, now: i64) {
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
    }

    fn sort_elapsed(player: &MazeAdminEntry, now: i64) -> i64 {
        if player.phase == MazePhase::Intro
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

    fn slot(&self, difficulty: MazeDifficulty) -> &LevelSlot {
        match difficulty {
            MazeDifficulty::Easy => &self.easy,
            MazeDifficulty::Medium => &self.medium,
            MazeDifficulty::Hard => &self.hard,
        }
    }

    fn slot_mut(&mut self, difficulty: MazeDifficulty) -> &mut LevelSlot {
        match difficulty {
            MazeDifficulty::Easy => &mut self.easy,
            MazeDifficulty::Medium => &mut self.medium,
            MazeDifficulty::Hard => &mut self.hard,
        }
    }
}

impl LevelSlot {
    fn new(
        puzzle: MazeFile,
        difficulty: MazeDifficulty,
        catalog: Option<Vec<MazePuzzleInfo>>,
    ) -> Result<Self, String> {
        if let Some(error) = validate_maze_file(&puzzle, difficulty) {
            return Err(error);
        }
        let catalog = catalog.unwrap_or_else(|| {
            vec![MazePuzzleInfo {
                id: puzzle.id.clone(),
                label: format!("{}.json", puzzle.id),
            }]
        });
        let pending_id = puzzle.id.clone();
        Ok(Self {
            public_puzzle: to_public_maze(&puzzle, difficulty),
            puzzle,
            pending_id,
            catalog,
        })
    }

    fn choice(&self) -> MazeLevelChoice {
        MazeLevelChoice {
            puzzle_id: self.puzzle.id.clone(),
            title: self.puzzle.title.clone(),
            pending_puzzle_id: self.pending_id.clone(),
            puzzles: self.catalog.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maze::{step_maze, MazePhase};

    fn campaign(start: i64) -> MazeEngine {
        MazeEngine::with_clock(
            step_maze(MazeDifficulty::Easy, "nursery", "Nursery door"),
            step_maze(MazeDifficulty::Medium, "kitchen", "The refrigerator"),
            step_maze(MazeDifficulty::Hard, "bottle", "Milk bottle"),
            None,
            None,
            None,
            Clock::manual(start),
        )
        .unwrap()
    }

    #[test]
    fn intro_splash_blocks_moves_until_it_ends() {
        let mut engine = campaign(1_000);
        engine.ensure_player("p1", "Ada");
        assert_eq!(
            engine.move_player("p1", MazeDirection::E).unwrap_err(),
            "Press OK to start"
        );
        engine.ack_intro("p1").unwrap();
        assert_eq!(
            engine.move_player("p1", MazeDirection::E).unwrap_err(),
            "Wait for the next maze"
        );
        engine.clock().set(1_000 + MAZE_SPLASH_MS);
        engine.move_player("p1", MazeDirection::E).unwrap();
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.phase, MazePhase::Splash);
        assert_eq!(snap.level, MazeDifficulty::Medium);
        assert_eq!(snap.score, 200);
        assert!(snap.active_since.is_none());
        assert!(snap.elapsed_ms >= 0);
    }

    #[test]
    fn refuses_backtracking_and_walls_and_spends_a_life_to_restart() {
        let mut engine = campaign(5_000);
        engine.ensure_player("p1", "Ada");
        engine.ack_intro("p1").unwrap();
        engine.clock().set(5_000 + MAZE_SPLASH_MS);
        engine.move_player("p1", MazeDirection::S).unwrap();
        assert_eq!(
            engine.move_player("p1", MazeDirection::N).unwrap_err(),
            "You cannot go back"
        );
        assert_eq!(
            engine.move_player("p1", MazeDirection::E).unwrap_err(),
            "That way is blocked"
        );
        engine.restart("p1").unwrap();
        let snap = engine.player_snapshot("p1").unwrap();
        assert_eq!(snap.lives, 2);
        assert_eq!(snap.position, MazeCellRef { row: 0, col: 0 });
        assert_eq!(snap.visited.len(), 1);
        assert_eq!(snap.phase, MazePhase::Playing);
    }

    #[test]
    fn last_restart_ends_the_run_and_a_full_clear_adds_hearts() {
        let mut engine = campaign(9_000);
        engine.ensure_player("p1", "Ada");
        engine.ack_intro("p1").unwrap();
        engine.clock().set(9_000 + MAZE_SPLASH_MS);
        engine.restart("p1").unwrap();
        engine.restart("p1").unwrap();
        engine.restart("p1").unwrap();
        let lost = engine.player_snapshot("p1").unwrap();
        assert_eq!(lost.phase, MazePhase::Lost);
        assert_eq!(lost.lives, 0);
        assert_eq!(lost.score, 0);
        assert!(engine.restart("p1").is_err());

        let mut winner = campaign(20_000);
        winner.ensure_player("p1", "Bea");
        winner.ack_intro("p1").unwrap();
        let mut now = 20_000;
        for _ in 0..3 {
            now += MAZE_SPLASH_MS;
            winner.clock().set(now);
            winner.move_player("p1", MazeDirection::E).unwrap();
        }
        let won = winner.player_snapshot("p1").unwrap();
        assert_eq!(won.phase, MazePhase::Won);
        assert_eq!(won.score, 1150);
        assert_eq!(won.lives, 3);
        assert!(won.completed_at.is_some());
        assert!(won.active_since.is_none());
    }

    #[test]
    fn pause_holds_the_clock_and_ack_is_a_no_op_after_intro() {
        let mut engine = campaign(0);
        engine.ensure_player("p1", "Ada");
        engine.ack_intro("p1").unwrap();
        engine.clock().set(MAZE_SPLASH_MS);
        engine.move_player("p1", MazeDirection::S).unwrap();
        engine.clock().set(MAZE_SPLASH_MS + 40);
        engine.pause_timer("p1");
        let paused = engine.player_snapshot("p1").unwrap();
        assert!(paused.active_since.is_none());
        assert_eq!(paused.elapsed_ms, 40);
        engine.clock().set(MAZE_SPLASH_MS + 90);
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 40);
        engine.resume_timer("p1");
        engine.clock().set(MAZE_SPLASH_MS + 110);
        assert_eq!(engine.player_snapshot("p1").unwrap().elapsed_ms, 60);
        engine.ack_intro("p1").unwrap();
        assert_eq!(
            engine.player_snapshot("p1").unwrap().phase,
            MazePhase::Playing
        );
    }

    #[test]
    fn ranks_by_score_then_time_and_resets_one_player() {
        let mut engine = campaign(0);
        engine.ensure_player("slow", "Slow");
        engine.ensure_player("idle", "Idle");
        engine.ensure_player("fast", "Fast");
        engine.ack_intro("slow").unwrap();
        engine.ack_intro("fast").unwrap();
        engine.clock().set(MAZE_SPLASH_MS);
        engine.move_player("fast", MazeDirection::E).unwrap();
        engine.clock().set(MAZE_SPLASH_MS + 30);
        engine.move_player("slow", MazeDirection::E).unwrap();
        let board = engine.admin_snapshot();
        let names: Vec<_> = board
            .players
            .iter()
            .map(|player| player.name.as_str())
            .collect();
        assert_eq!(names, ["Fast", "Slow", "Idle"]);
        engine.reset_player("fast").unwrap();
        let reset = engine.player_snapshot("fast").unwrap();
        assert_eq!(reset.phase, MazePhase::Intro);
        assert_eq!(reset.lives, 3);
        assert_eq!(reset.score, 0);
        assert_eq!(reset.level, MazeDifficulty::Easy);
    }
}
