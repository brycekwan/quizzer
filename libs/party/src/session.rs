use crate::names::{is_name_taken, is_valid_player_name, normalize_player_name};
use indexmap::IndexMap;
use rand::Rng;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub socket_id: Option<String>,
}

#[derive(Debug)]
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
                let replaced_socket_id = existing
                    .socket_id
                    .clone()
                    .filter(|current| current != socket_id);
                existing.socket_id = Some(socket_id.to_string());
                existing.connected = true;
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
            return Ok(LoginOk {
                session: by_name.clone(),
                replaced_socket_id,
            });
        }

        let names: Vec<String> = self.sessions.values().map(|session| session.name.clone()).collect();
        if is_name_taken(&normalized, names.iter().map(String::as_str)) {
            return Err("That name is already taken".into());
        }

        let id = new_player_id();
        let session = Session {
            id: id.clone(),
            name: normalized,
            connected: true,
            socket_id: Some(socket_id.to_string()),
        };
        self.sessions.insert(id, session.clone());
        Ok(LoginOk {
            session,
            replaced_socket_id: None,
        })
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
        let result = registry.login("Buddy", "s1", None).unwrap();
        assert_eq!(result.session.name, "Buddy");
        assert!(result.replaced_socket_id.is_none());
    }

    #[test]
    fn rejects_name_used_by_connected_session() {
        let mut registry = SessionRegistry::new();
        registry.login("Buddy", "s1", None).unwrap();
        assert!(registry.login("buddy", "s2", None).is_err());
    }

    #[test]
    fn reclaims_disconnected_session_by_name() {
        let mut registry = SessionRegistry::new();
        let first = registry.login("Buddy", "s1", None).unwrap();
        registry.mark_disconnected("s1");
        let reclaim = registry.login("Buddy", "s2", None).unwrap();
        assert_eq!(reclaim.session.id, first.session.id);
    }

    #[test]
    fn reports_replaced_socket_on_takeover() {
        let mut registry = SessionRegistry::new();
        let first = registry.login("Buddy", "s1", None).unwrap();
        let takeover = registry
            .login("Buddy", "s2", Some(&first.session.id))
            .unwrap();
        assert_eq!(takeover.replaced_socket_id.as_deref(), Some("s1"));
    }
}
