use crate::names::{is_name_taken, is_valid_player_name, normalize_player_name};
use indexmap::IndexMap;
use rand::Rng;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub socket_id: Option<String>,
    /// Last gameplay or login activity (unix ms). Used for idle disconnect.
    pub last_active_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginOk {
    pub session: Session,
    pub replaced_socket_id: Option<String>,
}

pub struct SessionRegistry {
    sessions: IndexMap<String, Session>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: IndexMap::new(),
        }
    }

    pub fn list(&self) -> Vec<Session> {
        self.sessions.values().cloned().collect()
    }

    pub fn get(&self, player_id: &str) -> Option<&Session> {
        self.sessions.get(player_id)
    }

    pub fn get_by_socket(&self, socket_id: &str) -> Option<&Session> {
        self.sessions
            .values()
            .find(|session| session.socket_id.as_deref() == Some(socket_id))
    }

    fn find_by_name(&self, name: &str) -> Option<String> {
        let target = normalize_player_name(name).to_lowercase();
        self.sessions
            .values()
            .find(|session| normalize_player_name(&session.name).to_lowercase() == target)
            .map(|session| session.id.clone())
    }

    pub fn login(
        &mut self,
        name: &str,
        socket_id: &str,
        player_id: Option<&str>,
        now: i64,
    ) -> Result<LoginOk, String> {
        if !is_valid_player_name(name) {
            return Err("Name must be 1–24 characters".into());
        }
        let normalized = normalize_player_name(name);

        if let Some(player_id) = player_id {
            if let Some(existing) = self.sessions.get_mut(player_id) {
                if normalize_player_name(&existing.name).to_lowercase() != normalized.to_lowercase()
                {
                    return Err("Session expired — please join again".into());
                }
                if existing.connected && existing.socket_id.as_deref() != Some(socket_id) {
                    return Err("That name is already in use by another player".into());
                }
                let replaced_socket_id = existing
                    .socket_id
                    .clone()
                    .filter(|current| current != socket_id);
                existing.socket_id = Some(socket_id.to_string());
                existing.connected = true;
                existing.last_active_at = now;
                return Ok(LoginOk {
                    session: existing.clone(),
                    replaced_socket_id,
                });
            }
        }

        if let Some(id) = self.find_by_name(&normalized) {
            let by_name = self.sessions.get_mut(&id).expect("session");
            if by_name.connected && by_name.socket_id.as_deref() != Some(socket_id) {
                return Err("That name is already in use by another player".into());
            }
            let replaced_socket_id = by_name
                .socket_id
                .clone()
                .filter(|current| current != socket_id);
            by_name.socket_id = Some(socket_id.to_string());
            by_name.connected = true;
            by_name.last_active_at = now;
            return Ok(LoginOk {
                session: by_name.clone(),
                replaced_socket_id,
            });
        }

        let names: Vec<String> = self
            .sessions
            .values()
            .map(|session| session.name.clone())
            .collect();
        if is_name_taken(&normalized, names.iter().map(String::as_str)) {
            return Err("That name is already taken".into());
        }

        let id = new_player_id();
        let session = Session {
            id: id.clone(),
            name: normalized,
            connected: true,
            socket_id: Some(socket_id.to_string()),
            last_active_at: now,
        };
        self.sessions.insert(id, session.clone());
        Ok(LoginOk {
            session,
            replaced_socket_id: None,
        })
    }

    /// Record that this socket was active at `now` (unix ms).
    pub fn touch(&mut self, socket_id: &str, now: i64) {
        let Some(session) = self
            .sessions
            .values_mut()
            .find(|session| session.socket_id.as_deref() == Some(socket_id))
        else {
            return;
        };
        session.last_active_at = now;
    }

    /// Socket ids for connected sessions that have been idle at least `timeout_ms`.
    pub fn idle_socket_ids(&self, now: i64, timeout_ms: i64) -> Vec<String> {
        if timeout_ms <= 0 {
            return Vec::new();
        }
        self.sessions
            .values()
            .filter(|session| session.connected)
            .filter(|session| now.saturating_sub(session.last_active_at) >= timeout_ms)
            .filter_map(|session| session.socket_id.clone())
            .collect()
    }

    pub fn mark_disconnected(&mut self, socket_id: &str) {
        let Some(id) = self
            .sessions
            .values()
            .find(|session| session.socket_id.as_deref() == Some(socket_id))
            .map(|session| session.id.clone())
        else {
            return;
        };
        let Some(session) = self.sessions.get_mut(&id) else {
            return;
        };
        if session.socket_id.as_deref() != Some(socket_id) {
            return;
        }
        session.connected = false;
        session.socket_id = None;
    }

    pub fn remove(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let Some(session) = self.sessions.shift_remove(player_id) else {
            return Err("Player not found".into());
        };
        Ok(session.socket_id)
    }

    pub fn clear(&mut self) {
        self.sessions.clear();
    }
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) fn new_player_id() -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut rng = rand::rng();
    let mut id = String::from("p_");
    for _ in 0..8 {
        let index = rng.random_range(0..ALPHABET.len());
        id.push(ALPHABET[index] as char);
    }
    id
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_session_for_unique_name() {
        let mut registry = SessionRegistry::new();
        let result = registry.login("Buddy", "s1", None, 1_000).unwrap();
        assert_eq!(result.session.name, "Buddy");
        assert_eq!(result.session.last_active_at, 1_000);
        assert!(result.replaced_socket_id.is_none());
    }

    #[test]
    fn rejects_name_used_by_connected_session() {
        let mut registry = SessionRegistry::new();
        registry.login("Buddy", "s1", None, 0).unwrap();
        assert!(registry.login("buddy", "s2", None, 0).is_err());
    }

    #[test]
    fn reclaims_disconnected_session_by_name() {
        let mut registry = SessionRegistry::new();
        let first = registry.login("Buddy", "s1", None, 0).unwrap();
        registry.mark_disconnected("s1");
        let reclaim = registry.login("Buddy", "s2", None, 50).unwrap();
        assert_eq!(reclaim.session.id, first.session.id);
        assert_eq!(reclaim.session.last_active_at, 50);
    }

    #[test]
    fn refuses_takeover_while_the_session_is_connected() {
        let mut registry = SessionRegistry::new();
        let first = registry.login("Buddy", "s1", None, 0).unwrap();
        let takeover = registry.login("Buddy", "s2", Some(&first.session.id), 0);
        assert!(takeover.is_err());
        assert_eq!(
            registry
                .get(&first.session.id)
                .unwrap()
                .socket_id
                .as_deref(),
            Some("s1")
        );
    }

    #[test]
    fn reclaims_a_disconnected_session_by_id() {
        let mut registry = SessionRegistry::new();
        let first = registry.login("Buddy", "s1", None, 0).unwrap();
        registry.mark_disconnected("s1");
        let reclaim = registry
            .login("Buddy", "s2", Some(&first.session.id), 0)
            .unwrap();
        assert_eq!(reclaim.session.id, first.session.id);
        assert_eq!(reclaim.replaced_socket_id, None);
    }

    #[test]
    fn touch_updates_last_active_at() {
        let mut registry = SessionRegistry::new();
        registry.login("Buddy", "s1", None, 10).unwrap();
        registry.touch("s1", 99);
        assert_eq!(registry.get_by_socket("s1").unwrap().last_active_at, 99);
    }

    #[test]
    fn idle_socket_ids_lists_connected_sessions_past_timeout() {
        let mut registry = SessionRegistry::new();
        registry.login("Ada", "s-ada", None, 0).unwrap();
        registry.login("Bea", "s-bea", None, 100).unwrap();
        registry.login("Cal", "s-cal", None, 0).unwrap();
        registry.mark_disconnected("s-cal");
        registry.touch("s-bea", 500);

        let idle = registry.idle_socket_ids(600_000, 10 * 60 * 1000);
        assert_eq!(idle, vec!["s-ada".to_string()]);
    }
}
