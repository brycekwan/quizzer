use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use party::maze::MazeDifficulty;
use party::system_admin::SystemAdmin;
use socketioxide::SocketIo;
use tokio::sync::Notify;

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
}
