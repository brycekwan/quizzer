use std::sync::Arc;

use party::load::{
    list_question_sets, load_crossword_puzzle, load_question_sets_in_order, load_word_search_puzzle,
    resolve_crossword_dir, resolve_questions_dir, resolve_word_search_dir,
};
use party::quizzer::SnapshotRole;
use party::types::{QuestionSetMode, SYSTEM_REMOVAL_REASON};
use party::word_search::WordSearchCellRef;
use serde_json::{json, Value};
use socketioxide::extract::{AckSender, Data, SocketRef, State};
use socketioxide::SocketIo;

use crate::state::{App, Role, SocketMeta};

pub fn register(io: &SocketIo) {
    io.ns("/", async |socket: SocketRef, State(app): State<Arc<App>>| {
        on_connect(socket, app);
    });
}

fn on_connect(socket: SocketRef, app: Arc<App>) {
    let sid = sid_of(&socket);
    {
        let mut meta = app.meta.lock().expect("meta");
        meta.entry(sid.clone()).or_default();
    }
    emit_game(&app, &socket);

    socket.on(
        "session:login",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_session_login(app, socket, payload, ack);
        },
    );
    socket.on(
        "player:join",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_player_join(app, socket, payload, ack);
        },
    );
    socket.on(
        "player:answer",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_player_answer(app, socket, payload, ack);
        },
    );
    socket.on(
        "admin:subscribe",
        async |socket: SocketRef, State(app): State<Arc<App>>| {
            let sid = sid_of(&socket);
            {
                let mut meta = app.meta.lock().expect("meta");
                meta.entry(sid).or_default().role = Role::Admin;
            }
            emit_game(&app, &socket);
        },
    );
    socket.on(
        "admin:start",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let delay = payload.get("delayMinutes").and_then(value_f64).unwrap_or(0.0);
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.quiz.start(delay) {
                    Ok(()) => json!({ "ok": true }),
                    Err(error) => fail(error),
                }
            };
            let _ = ack.send(&result);
            changed(&app);
            let _ = socket;
        },
    );
    socket.on(
        "admin:pause",
        async |ack: AckSender, State(app): State<Arc<App>>| {
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.quiz.pause() {
                    Ok(()) => json!({ "ok": true }),
                    Err(error) => fail(error),
                }
            };
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "admin:resume",
        async |ack: AckSender, State(app): State<Arc<App>>| {
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.quiz.resume() {
                    Ok(()) => json!({ "ok": true }),
                    Err(error) => fail(error),
                }
            };
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "admin:reset",
        async |ack: AckSender, State(app): State<Arc<App>>| {
            let socket_ids = {
                let mut party = app.party.lock().expect("party");
                party.quiz.reset()
            };
            for socket_id in &socket_ids {
                if let Some(target) = find_socket(&app, socket_id) {
                    if let Some(meta) = app.meta.lock().expect("meta").get_mut(&target.id.to_string()) {
                        meta.in_quizzer = false;
                    }
                    let _ = target.emit(
                        "game:reset",
                        &json!({ "reason": "Game was reset — back to the menu" }),
                    );
                }
            }
            let _ = ack.send(&json!({ "ok": true, "socketIds": socket_ids }));
            changed(&app);
        },
    );
    socket.on(
        "admin:config",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.quiz.update_config_partial(
                    payload.get("timeLimitSeconds").and_then(value_i64),
                    payload.get("defaultScore").and_then(value_i64),
                    payload.get("minScore").and_then(value_i64),
                    payload.get("scaleMs").and_then(value_i64),
                    payload.get("revealDurationMs").and_then(value_i64),
                    payload.get("leaderboardDurationMs").and_then(value_i64),
                ) {
                    Ok(()) => json!({ "ok": true }),
                    Err(error) => fail(error),
                }
            };
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "admin:questionSet",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let result = select_question_sets(&app, &payload);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "admin:kick",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_quiz_kick(app, payload, ack);
        },
    );

    socket.on(
        "crossword:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_crossword_subscribe(app, socket, ack);
        },
    );
    socket.on(
        "crossword:setLetter",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_crossword_letter(app, socket, payload, ack, false);
        },
    );
    socket.on(
        "crossword:clearLetter",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_crossword_letter(app, socket, payload, ack, true);
        },
    );
    socket.on(
        "crossword:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            flag_mut(&app, &socket, |meta| meta.crossword_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_crossword_admin(&app, &socket);
        },
    );
    socket.on(
        "crossword:admin:selectPuzzle",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let result = select_named(&payload, "puzzleId", "Select a crossword", |id| {
                let mut party = app.party.lock().expect("party");
                party.crossword.select_puzzle(id)
            });
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "crossword:admin:reset",
        async |ack: AckSender, State(app): State<Arc<App>>| {
            let result = reset_crossword(&app);
            let _ = ack.send(&result);
            changed(&app);
        },
    );

    socket.on(
        "wordsearch:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_wordsearch_subscribe(app, socket, ack);
        },
    );
    socket.on(
        "wordsearch:submitSelection",
        async |socket: SocketRef, Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_wordsearch_selection(app, socket, payload, ack);
        },
    );
    socket.on(
        "wordsearch:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            flag_mut(&app, &socket, |meta| meta.wordsearch_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_wordsearch_admin(&app, &socket);
        },
    );
    socket.on(
        "wordsearch:admin:selectPuzzle",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let result = select_named(&payload, "puzzleId", "Select a word search", |id| {
                let mut party = app.party.lock().expect("party");
                party.word_search.select_puzzle(id)
            });
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsearch:admin:reset",
        async |ack: AckSender, State(app): State<Arc<App>>| {
            let result = reset_word_search(&app, None);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsearch:admin:resetPlayer",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            let player_id = payload.get("playerId").and_then(Value::as_str).unwrap_or("").trim();
            if player_id.is_empty() {
                let _ = ack.send(&fail("Choose a player"));
                return;
            }
            let player_id = player_id.to_string();
            let result = reset_word_search(&app, Some(&player_id));
            let _ = ack.send(&result);
            changed(&app);
        },
    );

    socket.on(
        "system:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            flag_mut(&app, &socket, |meta| meta.system_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_system(&app, &socket);
        },
    );
    socket.on(
        "system:admin:kick",
        async |Data(payload): Data<Value>, ack: AckSender, State(app): State<Arc<App>>| {
            on_system_kick(app, payload, ack);
        },
    );

    socket.on_disconnect(async |socket: SocketRef, State(app): State<Arc<App>>| {
        let sid = sid_of(&socket);
        let meta = app.meta.lock().expect("meta").get(&sid).cloned();
        if let Some(meta) = meta {
            let mut party = app.party.lock().expect("party");
            if meta.in_quizzer || meta.player_id.is_some() {
                party.quiz.mark_disconnected(&sid);
            }
            party.sessions.mark_disconnected(&sid);
            if meta.crossword_player {
                if let Some(player_id) = &meta.player_id {
                    party.crossword.pause_timer(player_id);
                }
            }
            if meta.wordsearch_player {
                if let Some(player_id) = &meta.player_id {
                    party.word_search.pause_timer(player_id);
                }
            }
        }
        app.meta.lock().expect("meta").remove(&sid);
        drop(socket);
        changed(&app);
    });
}

fn on_session_login(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let name = payload.get("name").and_then(Value::as_str).unwrap_or("");
    let player_id = payload.get("playerId").and_then(Value::as_str).map(str::to_string);
    let sid = sid_of(&socket);
    let result = {
        let mut party = app.party.lock().expect("party");
        party.sessions.login(name, &sid, player_id.as_deref())
    };
    match result {
        Ok(login) => {
            displace(&app, login.replaced_socket_id.as_deref());
            {
                let mut meta = app.meta.lock().expect("meta");
                let entry = meta.entry(sid).or_default();
                entry.player_id = Some(login.session.id.clone());
                entry.role = Role::Player;
            }
            let _ = ack.send(&json!({
                "ok": true,
                "playerId": login.session.id,
                "name": login.session.name,
            }));
        }
        Err(error) => {
            let _ = ack.send(&fail(error));
        }
    }
    changed(&app);
}

fn on_player_join(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let name = payload.get("name").and_then(Value::as_str).unwrap_or("");
    let requested = payload.get("playerId").and_then(Value::as_str).map(str::to_string);
    let sid = sid_of(&socket);
    let existing_id = {
        let meta = app.meta.lock().expect("meta");
        meta.get(&sid).and_then(|meta| meta.player_id.clone())
    };

    let (session_id, session_name) = if let Some(session_id) = existing_id {
        let name = {
            let party = app.party.lock().expect("party");
            party.sessions.get(&session_id).map(|session| session.name.clone())
        };
        let Some(session_name) = name else {
            let _ = ack.send(&fail("Log in first"));
            return;
        };
        (session_id, session_name)
    } else {
        let login = {
            let mut party = app.party.lock().expect("party");
            party.sessions.login(name, &sid, requested.as_deref())
        };
        match login {
            Ok(login) => {
                displace(&app, login.replaced_socket_id.as_deref());
                (login.session.id, login.session.name)
            }
            Err(error) => {
                let _ = ack.send(&fail(error));
                return;
            }
        }
    };

    let joined = {
        let mut party = app.party.lock().expect("party");
        party.quiz.join(&session_name, &sid, Some(&session_id))
    };
    match joined {
        Ok(join) => {
            displace(&app, join.replaced_socket_id.as_deref());
            {
                let mut meta = app.meta.lock().expect("meta");
                let entry = meta.entry(sid).or_default();
                entry.player_id = Some(join.player.id.clone());
                entry.role = Role::Player;
                entry.in_quizzer = true;
            }
            let _ = ack.send(&json!({
                "ok": true,
                "playerId": join.player.id,
                "name": join.player.name,
            }));
            emit_game(&app, &socket);
        }
        Err(error) => {
            let _ = ack.send(&fail(error));
        }
    }
    changed(&app);
}

fn on_player_answer(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let fallback = payload.get("playerId").and_then(Value::as_str).map(str::to_string);
    let sid = sid_of(&socket);
    let player_id = {
        let meta = app.meta.lock().expect("meta");
        meta.get(&sid)
            .and_then(|meta| meta.player_id.clone())
            .or(fallback)
    };
    let Some(player_id) = player_id else {
        let _ = ack.send(&fail("Join the game first"));
        return;
    };
    {
        let mut meta = app.meta.lock().expect("meta");
        meta.entry(sid).or_default().player_id = Some(player_id.clone());
    }
    let answer_id = payload.get("answerId").and_then(Value::as_str).unwrap_or("");
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.quiz.submit_answer(&player_id, answer_id) {
            Ok(points) => json!({ "ok": true, "points": points }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_quiz_kick(app: Arc<App>, payload: Value, ack: AckSender) {
    let player_id = payload.get("playerId").and_then(Value::as_str).unwrap_or("").to_string();
    let result = {
        let mut party = app.party.lock().expect("party");
        let kicked = party.quiz.kick(&player_id);
        let _ = party.sessions.remove(&player_id);
        kicked
    };
    match result {
        Ok(socket_id) => {
            if let Some(socket_id) = socket_id {
                if let Some(target) = find_socket(&app, &socket_id) {
                    clear_player_flags(&app, &target);
                    let _ = target.emit("player:kicked", &json!({ "reason": "Removed by admin" }));
                    let _ = target.disconnect();
                }
            }
            let _ = ack.send(&json!({ "ok": true }));
        }
        Err(error) => {
            let _ = ack.send(&fail(error));
        }
    }
    changed(&app);
}

fn on_crossword_subscribe(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let name = {
        let party = app.party.lock().expect("party");
        party.sessions.get(&player_id).map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.crossword.ensure_player(&player_id, &name);
        party.crossword.resume_timer(&player_id);
    }
    flag_mut(&app, &socket, |meta| meta.crossword_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_crossword_player(&app, &socket);
    changed(&app);
}

fn on_crossword_letter(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender, clear: bool) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some(row) = payload.get("row").and_then(value_i64) else {
        let _ = ack.send(&fail("Invalid cell"));
        return;
    };
    let Some(col) = payload.get("col").and_then(value_i64) else {
        let _ = ack.send(&fail("Invalid cell"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        if clear {
            party.crossword.clear_letter(&player_id, row, col)
        } else {
            let letter = payload.get("letter").and_then(Value::as_str).unwrap_or("");
            party.crossword.set_letter(&player_id, row, col, letter)
        }
    };
    let _ = ack.send(&match result {
        Ok(ids) => json!({ "ok": true, "correctWordIds": ids }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_wordsearch_subscribe(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let name = {
        let party = app.party.lock().expect("party");
        party.sessions.get(&player_id).map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.word_search.ensure_player(&player_id, &name);
        party.word_search.resume_timer(&player_id);
    }
    flag_mut(&app, &socket, |meta| meta.wordsearch_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_wordsearch_player(&app, &socket);
    changed(&app);
}

fn on_wordsearch_selection(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app.meta.lock().expect("meta").get(&sid).cloned().unwrap_or_default();
    let Some(player_id) = meta.player_id.clone().filter(|_| meta.wordsearch_player) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some(cells) = selection_cells(payload.get("cells")) else {
        let _ = ack.send(&fail("Invalid selection"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        party.word_search.submit_selection(&player_id, &cells)
    };
    let _ = ack.send(&match result {
        Ok(matched) => json!({ "ok": true, "matched": matched }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_system_kick(app: Arc<App>, payload: Value, ack: AckSender) {
    let player_id = payload.get("playerId").and_then(Value::as_str).unwrap_or("").trim();
    if player_id.is_empty() {
        let _ = ack.send(&fail("Choose a player"));
        return;
    }
    let player_id = player_id.to_string();
    let result = {
        let mut party = app.party.lock().expect("party");
        party.remove_player(&player_id)
    };
    match result {
        Ok(socket_id) => {
            if let Some(socket_id) = socket_id {
                if let Some(target) = find_socket(&app, &socket_id) {
                    clear_player_flags(&app, &target);
                    let _ = target.emit(
                        "player:kicked",
                        &json!({ "reason": SYSTEM_REMOVAL_REASON }),
                    );
                    let _ = target.disconnect();
                }
            }
            let _ = ack.send(&json!({ "ok": true }));
        }
        Err(error) => {
            let _ = ack.send(&fail(error));
        }
    }
    changed(&app);
}

fn select_question_sets(app: &App, payload: &Value) -> Value {
    let mode = if payload.get("mode").and_then(Value::as_str) == Some("continuous") {
        QuestionSetMode::Continuous
    } else {
        QuestionSetMode::Single
    };
    let mut ids = Vec::new();
    if let Some(list) = payload.get("questionSetIds").and_then(Value::as_array) {
        for id in list {
            if let Some(id) = id.as_str().map(str::trim).filter(|id| !id.is_empty()) {
                ids.push(id.to_string());
            }
        }
    }
    if ids.is_empty() {
        if let Some(id) = payload
            .get("questionSetId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
        {
            ids.push(id.to_string());
        }
    }
    if ids.is_empty() {
        return fail("Select at least one question set");
    }
    if mode == QuestionSetMode::Single && ids.len() != 1 {
        return fail("Single mode requires exactly one question set");
    }
    let dir = resolve_questions_dir();
    {
        let mut party = app.party.lock().expect("party");
        party.quiz.set_question_sets(list_question_sets(&dir));
    }
    let questions = match load_question_sets_in_order(&ids, &dir) {
        Ok(questions) => questions,
        Err(error) => return fail(error),
    };
    let mut party = app.party.lock().expect("party");
    match party.quiz.set_questions(ids, questions, mode) {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    }
}

fn reset_crossword(app: &App) -> Value {
    let mut party = app.party.lock().expect("party");
    let pending = party.crossword.pending_puzzle_id().to_string();
    let active = party.crossword.active_puzzle_id().to_string();
    if pending != active {
        match load_crossword_puzzle(&pending, &resolve_crossword_dir()) {
            Ok((puzzle, words)) => party.crossword.set_puzzle(puzzle, words),
            Err(error) => return fail(error),
        }
    }
    party.crossword.reset();
    json!({ "ok": true })
}

fn reset_word_search(app: &App, only_player: Option<&str>) -> Value {
    let resume_ids = subscribed_wordsearch(app, only_player);
    let mut party = app.party.lock().expect("party");
    if only_player.is_none() {
        let pending = party.word_search.pending_puzzle_id().to_string();
        let active = party.word_search.active_puzzle_id().to_string();
        if pending != active {
            match load_word_search_puzzle(&pending, &resolve_word_search_dir()) {
                Ok((puzzle, words)) => party.word_search.set_puzzle(puzzle, words),
                Err(error) => return fail(error),
            }
        }
        party.word_search.reset();
    } else if let Some(player_id) = only_player {
        if let Err(error) = party.word_search.reset_player(player_id) {
            return fail(error);
        }
    }
    for player_id in resume_ids {
        party.word_search.resume_timer(&player_id);
    }
    json!({ "ok": true })
}

fn subscribed_wordsearch(app: &App, only_player: Option<&str>) -> Vec<String> {
    app.meta
        .lock()
        .expect("meta")
        .values()
        .filter(|meta| meta.wordsearch_player)
        .filter_map(|meta| meta.player_id.clone())
        .filter(|id| only_player.is_none_or(|wanted| wanted == id))
        .collect()
}

fn select_named(
    payload: &Value,
    key: &str,
    missing: &str,
    apply: impl FnOnce(&str) -> Result<(), String>,
) -> Value {
    let Some(id) = payload.get(key).and_then(Value::as_str).map(str::trim).filter(|id| !id.is_empty()) else {
        return fail(missing);
    };
    match apply(id) {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    }
}

fn selection_cells(value: Option<&Value>) -> Option<Vec<WordSearchCellRef>> {
    let Some(value) = value else {
        return Some(Vec::new());
    };
    let Some(list) = value.as_array() else {
        return None;
    };
    let mut cells = Vec::new();
    for cell in list {
        let Some(cell) = cell.as_object() else {
            return None;
        };
        let Some(row) = cell.get("row").and_then(value_i64) else {
            return None;
        };
        let Some(col) = cell.get("col").and_then(value_i64) else {
            return None;
        };
        cells.push(WordSearchCellRef { row, col });
    }
    Some(cells)
}

fn displace(app: &App, socket_id: Option<&str>) {
    let Some(socket_id) = socket_id else {
        return;
    };
    let Some(target) = find_socket(app, socket_id) else {
        return;
    };
    if let Some(meta) = app.meta.lock().expect("meta").get_mut(&target.id.to_string()) {
        meta.player_id = None;
        meta.in_quizzer = false;
    }
    let _ = target.emit(
        "player:kicked",
        &json!({ "reason": "Signed in from another device" }),
    );
    let _ = target.disconnect();
}

fn clear_player_flags(app: &App, socket: &SocketRef) {
    if let Some(meta) = app.meta.lock().expect("meta").get_mut(&socket.id.to_string()) {
        meta.player_id = None;
        meta.in_quizzer = false;
        meta.crossword_player = false;
        meta.wordsearch_player = false;
    }
}

fn changed(app: &App) {
    broadcast(app);
    app.notify.notify_one();
}

pub fn broadcast(app: &App) {
    let Some(io) = app.io.get() else {
        return;
    };
    let sockets = io.sockets();
    for socket in sockets {
        let meta = app
            .meta
            .lock()
            .expect("meta")
            .get(&socket.id.to_string())
            .cloned()
            .unwrap_or_default();
        emit_game_for(&app, &socket, &meta);
        if meta.crossword_player {
            emit_crossword_player(&app, &socket);
        }
        if meta.crossword_admin {
            emit_crossword_admin(&app, &socket);
        }
        if meta.wordsearch_player {
            emit_wordsearch_player(&app, &socket);
        }
        if meta.wordsearch_admin {
            emit_wordsearch_admin(&app, &socket);
        }
        if meta.system_admin {
            emit_system(&app, &socket);
        }
    }
}

fn emit_game(app: &App, socket: &SocketRef) {
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&socket.id.to_string())
        .cloned()
        .unwrap_or_default();
    emit_game_for(app, socket, &meta);
}

fn emit_game_for(app: &App, socket: &SocketRef, meta: &SocketMeta) {
    let role = if meta.role == Role::Admin {
        SnapshotRole::Admin
    } else {
        SnapshotRole::Player
    };
    let party = app.party.lock().expect("party");
    let snapshot = party.quiz.snapshot(role, meta.player_id.as_deref());
    drop(party);
    let _ = socket.emit("game:state", &snapshot);
}

fn emit_crossword_player(app: &App, socket: &SocketRef) {
    let Some(player_id) = player_id_of(app, socket) else {
        return;
    };
    let party = app.party.lock().expect("party");
    let Some(snapshot) = party.crossword.player_snapshot(&player_id) else {
        return;
    };
    drop(party);
    let _ = socket.emit("crossword:state", &snapshot);
}

fn emit_crossword_admin(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.crossword.admin_snapshot();
    drop(party);
    let _ = socket.emit("crossword:admin:state", &snapshot);
}

fn emit_wordsearch_player(app: &App, socket: &SocketRef) {
    let Some(player_id) = player_id_of(app, socket) else {
        return;
    };
    let party = app.party.lock().expect("party");
    let Some(snapshot) = party.word_search.player_snapshot(&player_id) else {
        return;
    };
    drop(party);
    let _ = socket.emit("wordsearch:state", &snapshot);
}

fn emit_wordsearch_admin(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.word_search.admin_snapshot();
    drop(party);
    let _ = socket.emit("wordsearch:admin:state", &snapshot);
}

fn emit_system(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.snapshot();
    drop(party);
    let _ = socket.emit("system:admin:state", &snapshot);
}

fn player_id_of(app: &App, socket: &SocketRef) -> Option<String> {
    app.meta
        .lock()
        .expect("meta")
        .get(&socket.id.to_string())
        .and_then(|meta| meta.player_id.clone())
}

fn flag_mut(app: &App, socket: &SocketRef, update: impl FnOnce(&mut SocketMeta)) {
    let mut meta = app.meta.lock().expect("meta");
    update(meta.entry(sid_of(socket)).or_default());
}

fn find_socket(app: &App, socket_id: &str) -> Option<SocketRef> {
    let io = app.io.get()?;
    io.sockets()
        .into_iter()
        .find(|socket| socket.id.to_string() == socket_id)
}

fn sid_of(socket: &SocketRef) -> String {
    socket.id.to_string()
}

fn fail(error: impl Into<String>) -> Value {
    json!({ "ok": false, "error": error.into() })
}

fn value_i64(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| {
        value.as_f64().and_then(|number| {
            if number.is_finite() && number.fract() == 0.0 {
                Some(number as i64)
            } else {
                None
            }
        })
    })
}

fn value_f64(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_i64().map(|number| number as f64))
}
