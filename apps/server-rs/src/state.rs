use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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
    /// Play clock is paused because this socket has the instructions open.
    pub wordsearch_help: bool,
    pub system_admin: bool,
}

pub struct App {
    pub party: Mutex<SystemAdmin>,
    pub meta: Mutex<HashMap<String, SocketMeta>>,
    pub io: OnceLock<SocketIo>,
    pub notify: Notify,
}

impl App {
    pub fn new(party: SystemAdmin) -> Self {
        Self {
            party: Mutex::new(party),
            meta: Mutex::new(HashMap::new()),
            io: OnceLock::new(),
            notify: Notify::new(),
        }
    }
}
