use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use party::maze::MazeDifficulty;
use party::system_admin::SystemAdmin;
use socketioxide::SocketIo;
use tokio::sync::Notify;

/// Human-paced gameplay inputs per socket within one window.
pub const INPUT_RATE_LIMIT: u32 = 60;
pub(crate) const INPUT_RATE_WINDOW: Duration = Duration::from_secs(1);
/// Consecutive rejects before the socket is dropped for flooding.
pub(crate) const INPUT_RATE_DISCONNECT_AFTER: u32 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RateDecision {
    Allow,
    Reject,
    Disconnect,
}

/// Sliding 1s counter of inbound gameplay events for one socket.
#[derive(Clone, Debug)]
pub struct InputRate {
    window_started: Instant,
    count: u32,
    rejected_in_row: u32,
}

impl Default for InputRate {
    fn default() -> Self {
        Self {
            window_started: Instant::now(),
            count: 0,
            rejected_in_row: 0,
        }
    }
}

impl InputRate {
    pub fn check(&mut self, now: Instant) -> RateDecision {
        if now.duration_since(self.window_started) >= INPUT_RATE_WINDOW {
            self.window_started = now;
            self.count = 0;
        }
        if self.count < INPUT_RATE_LIMIT {
            self.count += 1;
            self.rejected_in_row = 0;
            return RateDecision::Allow;
        }
        self.rejected_in_row = self.rejected_in_row.saturating_add(1);
        if self.rejected_in_row >= INPUT_RATE_DISCONNECT_AFTER {
            RateDecision::Disconnect
        } else {
            RateDecision::Reject
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum Role {
    #[default]
    Player,
    Admin,
}

#[derive(Clone, Default)]
pub struct SocketMeta {
    pub player_id: Option<String>,
    pub role: Role,
    pub in_quizzer: bool,
    pub crossword_player: bool,
    pub crossword_admin: bool,
    pub wordsearch_player: bool,
    pub wordsearch_admin: bool,
    pub sudoku_player: bool,
    pub sudoku_admin: bool,
    pub maze_player: bool,
    pub maze_admin: bool,
    pub word_survivor_player: bool,
    pub word_survivor_admin: bool,
    pub system_admin: bool,
    pub leaderboard: bool,
    /// This socket presented the host passphrase.
    pub host: bool,
    /// The maze this socket was last sent, so later updates can leave it out.
    pub maze_puzzle: Option<(MazeDifficulty, String)>,
    /// Gameplay packet rate for this connection.
    pub input_rate: InputRate,
}

impl SocketMeta {
    /// Quiz players and the quiz host, plus sockets that have not entered another view.
    pub fn wants_quiz(&self) -> bool {
        if self.in_quizzer || self.role == Role::Admin {
            return true;
        }
        !(self.crossword_player
            || self.crossword_admin
            || self.wordsearch_player
            || self.wordsearch_admin
            || self.sudoku_player
            || self.sudoku_admin
            || self.maze_player
            || self.maze_admin
            || self.word_survivor_player
            || self.word_survivor_admin
            || self.system_admin
            || self.leaderboard)
    }
}

/// Shared views waiting for the next flush.
#[derive(Clone, Copy, Default)]
pub struct Dirty {
    pub quiz: bool,
    pub crossword: bool,
    pub word_search: bool,
    pub sudoku: bool,
    pub maze: bool,
    pub word_survivor: bool,
    pub system: bool,
    pub leaderboard: bool,
}

impl Dirty {
    pub const ALL: Dirty = Dirty {
        quiz: true,
        crossword: true,
        word_search: true,
        sudoku: true,
        maze: true,
        word_survivor: true,
        system: true,
        leaderboard: true,
    };

    pub fn any(&self) -> bool {
        self.quiz
            || self.crossword
            || self.word_search
            || self.sudoku
            || self.maze
            || self.word_survivor
            || self.system
            || self.leaderboard
    }

    pub fn merge(&mut self, other: Dirty) {
        self.quiz |= other.quiz;
        self.crossword |= other.crossword;
        self.word_search |= other.word_search;
        self.sudoku |= other.sudoku;
        self.maze |= other.maze;
        self.word_survivor |= other.word_survivor;
        self.system |= other.system;
        self.leaderboard |= other.leaderboard;
    }
}

pub struct App {
    pub party: Mutex<SystemAdmin>,
    pub meta: Mutex<HashMap<String, SocketMeta>>,
    pub io: OnceLock<SocketIo>,
    pub notify: Notify,
    pub dirty: Mutex<Dirty>,
    pub host_secret: String,
}

impl App {
    pub fn new(party: SystemAdmin, host_secret: String) -> Self {
        Self {
            party: Mutex::new(party),
            meta: Mutex::new(HashMap::new()),
            io: OnceLock::new(),
            notify: Notify::new(),
            dirty: Mutex::new(Dirty::default()),
            host_secret,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiz_goes_to_quiz_sockets_and_sockets_with_no_other_view() {
        assert!(SocketMeta::default().wants_quiz());
        let maze = SocketMeta {
            maze_player: true,
            ..SocketMeta::default()
        };
        assert!(!maze.wants_quiz());
        let both = SocketMeta {
            maze_player: true,
            in_quizzer: true,
            ..SocketMeta::default()
        };
        assert!(both.wants_quiz());
        let host = SocketMeta {
            role: Role::Admin,
            ..SocketMeta::default()
        };
        assert!(host.wants_quiz());
        let board = SocketMeta {
            leaderboard: true,
            ..SocketMeta::default()
        };
        assert!(!board.wants_quiz());
    }

    #[test]
    fn merge_keeps_every_flag() {
        let mut dirty = Dirty::default();
        assert!(!dirty.any());
        dirty.merge(Dirty {
            maze: true,
            ..Dirty::default()
        });
        dirty.merge(Dirty {
            system: true,
            ..Dirty::default()
        });
        assert!(dirty.maze && dirty.system && !dirty.quiz);
        assert!(dirty.any());
    }

    #[test]
    fn input_rate_allows_up_to_the_limit_then_rejects() {
        let mut rate = InputRate::default();
        let now = Instant::now();
        for _ in 0..INPUT_RATE_LIMIT {
            assert_eq!(rate.check(now), RateDecision::Allow);
        }
        assert_eq!(rate.check(now), RateDecision::Reject);
    }

    #[test]
    fn input_rate_resets_after_the_window() {
        let mut rate = InputRate::default();
        let now = Instant::now();
        for _ in 0..INPUT_RATE_LIMIT {
            assert_eq!(rate.check(now), RateDecision::Allow);
        }
        assert_eq!(rate.check(now), RateDecision::Reject);
        let next = now + INPUT_RATE_WINDOW;
        assert_eq!(rate.check(next), RateDecision::Allow);
    }

    #[test]
    fn input_rate_disconnects_after_sustained_rejects() {
        let mut rate = InputRate::default();
        let now = Instant::now();
        for _ in 0..INPUT_RATE_LIMIT {
            assert_eq!(rate.check(now), RateDecision::Allow);
        }
        for _ in 0..(INPUT_RATE_DISCONNECT_AFTER - 1) {
            assert_eq!(rate.check(now), RateDecision::Reject);
        }
        assert_eq!(rate.check(now), RateDecision::Disconnect);
    }
}
