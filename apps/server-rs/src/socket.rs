use std::sync::Arc;

use party::load::{
    list_question_sets, list_word_survivor_files, load_crossword_puzzle, load_maze_puzzle,
    load_question_sets_in_order, load_sudoku_puzzle, load_word_search_puzzle,
    load_word_survivor_file, maze_difficulty_dir, resolve_crossword_dir, resolve_maze_dir,
    resolve_questions_dir, resolve_sudoku_dir, resolve_word_search_dir, resolve_word_survivor_dir,
};
use party::maze::{MazeDifficulty, MazeDirection};
use party::quizzer::SnapshotRole;
use party::types::{QuestionSetMode, QUIZ_REMOVAL_REASON, SYSTEM_REMOVAL_REASON};
use party::word_search::WordSearchCellRef;
use serde_json::{json, Value};
use socketioxide::extract::{AckSender, Data, SocketRef, State};
use socketioxide::SocketIo;

use crate::state::{App, Role, SocketMeta};

pub fn register(io: &SocketIo) {
    io.ns(
        "/",
        async |socket: SocketRef, State(app): State<Arc<App>>| {
            on_connect(socket, app);
        },
    );
}

fn on_connect(socket: SocketRef, app: Arc<App>) {
    let sid = sid_of(&socket);
    {
        let mut meta = app.meta.lock().expect("meta");
        meta.entry(sid.clone()).or_default();
    }
    emit_game(&app, &socket);
    emit_theme(&app, &socket);

    socket.on(
        "host:unlock",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            let provided = payload.get("secret").and_then(Value::as_str).unwrap_or("");
            if !secrets_match(&app.host_secret, provided) {
                let _ = ack.send(&fail("Incorrect host passphrase"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.host = true);
            let _ = ack.send(&json!({ "ok": true }));
        },
    );
    socket.on(
        "session:login",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_session_login(app, socket, payload, ack);
        },
    );
    socket.on(
        "player:join",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_player_join(app, socket, payload, ack);
        },
    );
    socket.on(
        "player:answer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_player_answer(app, socket, payload, ack);
        },
    );
    socket.on(
        "admin:subscribe",
        async |socket: SocketRef, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                return;
            }
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
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let delay = payload
                .get("delayMinutes")
                .and_then(value_f64)
                .unwrap_or(0.0);
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
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let socket_ids = {
                let mut party = app.party.lock().expect("party");
                party.quiz.reset()
            };
            for socket_id in &socket_ids {
                if let Some(target) = find_socket(&app, socket_id) {
                    if let Some(meta) = app
                        .meta
                        .lock()
                        .expect("meta")
                        .get_mut(&target.id.to_string())
                    {
                        meta.in_quizzer = false;
                    }
                    let _ = target.emit(
                        "game:reset",
                        &json!({ "reason": "Game was reset — return to the lobby" }),
                    );
                }
            }
            let _ = ack.send(&json!({ "ok": true, "socketIds": socket_ids }));
            changed(&app);
        },
    );
    socket.on(
        "admin:config",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = select_question_sets(&app, &payload);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "admin:kick",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_crossword_letter(app, socket, payload, ack, false);
        },
    );
    socket.on(
        "crossword:clearLetter",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_crossword_letter(app, socket, payload, ack, true);
        },
    );
    socket.on("crossword:pauseTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on("crossword:resumeTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on(
        "crossword:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.crossword_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_crossword_admin(&app, &socket);
        },
    );
    socket.on(
        "crossword:admin:selectPuzzle",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = reset_crossword(&app);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "crossword:admin:resetPlayer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let player_id = payload
                .get("playerId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if player_id.is_empty() {
                let _ = ack.send(&fail("Choose a player"));
                return;
            }
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.crossword.reset_player(player_id) {
                    Ok(()) => json!({ "ok": true }),
                    Err(error) => fail(error),
                }
            };
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
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_wordsearch_selection(app, socket, payload, ack);
        },
    );
    socket.on("wordsearch:pauseTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on("wordsearch:resumeTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on(
        "wordsearch:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.wordsearch_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_wordsearch_admin(&app, &socket);
        },
    );
    socket.on(
        "wordsearch:admin:selectPuzzle",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
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
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = reset_word_search(&app, None);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsearch:admin:resetPlayer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let player_id = payload
                .get("playerId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
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
        "sudoku:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_sudoku_subscribe(app, socket, ack);
        },
    );
    socket.on(
        "sudoku:commit",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_sudoku_commit(app, socket, payload, ack);
        },
    );
    socket.on(
        "sudoku:draft",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_sudoku_draft(app, socket, payload, ack);
        },
    );
    socket.on(
        "sudoku:erase",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_sudoku_erase(app, socket, payload, ack);
        },
    );
    socket.on(
        "sudoku:hint",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_sudoku_hint(app, socket, payload, ack);
        },
    );
    socket.on("sudoku:pauseTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on("sudoku:resumeTimer", async |ack: AckSender| {
        let _ = ack.send(&json!({ "ok": true }));
    });
    socket.on(
        "sudoku:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.sudoku_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_sudoku_admin(&app, &socket);
        },
    );
    socket.on(
        "sudoku:admin:selectPuzzle",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = select_named(&payload, "puzzleId", "Select a sudoku", |id| {
                let mut party = app.party.lock().expect("party");
                party.sudoku.select_puzzle(id)
            });
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "sudoku:admin:reset",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = reset_sudoku(&app, None);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "sudoku:admin:resetPlayer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let player_id = payload
                .get("playerId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if player_id.is_empty() {
                let _ = ack.send(&fail("Choose a player"));
                return;
            }
            let player_id = player_id.to_string();
            let result = reset_sudoku(&app, Some(&player_id));
            let _ = ack.send(&result);
            changed(&app);
        },
    );

    socket.on(
        "maze:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_maze_subscribe(app, socket, ack);
        },
    );
    socket.on(
        "maze:ackIntro",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_maze_ack(app, socket, ack);
        },
    );
    socket.on(
        "maze:move",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_maze_move(app, socket, payload, ack);
        },
    );
    socket.on(
        "maze:restart",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_maze_restart(app, socket, ack);
        },
    );
    socket.on(
        "maze:pauseTimer",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_maze_pause(app, socket, ack, true);
        },
    );
    socket.on(
        "maze:resumeTimer",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_maze_pause(app, socket, ack, false);
        },
    );
    socket.on(
        "maze:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.maze_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_maze_admin(&app, &socket);
        },
    );
    socket.on(
        "maze:admin:select",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = select_maze(&app, &payload);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "maze:admin:reset",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = reset_maze(&app, None);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "maze:admin:resetPlayer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let player_id = payload
                .get("playerId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if player_id.is_empty() {
                let _ = ack.send(&fail("Choose a player"));
                return;
            }
            let player_id = player_id.to_string();
            let result = reset_maze(&app, Some(&player_id));
            let _ = ack.send(&result);
            changed(&app);
        },
    );

    socket.on(
        "wordsurvivor:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_subscribe(app, socket, ack);
        },
    );
    socket.on(
        "wordsurvivor:ackIntro",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_ack(app, socket, ack);
        },
    );
    socket.on(
        "wordsurvivor:letter",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            on_word_survivor_letter(app, socket, payload, ack);
        },
    );
    socket.on(
        "wordsurvivor:backspace",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_edit(app, socket, ack, false);
        },
    );
    socket.on(
        "wordsurvivor:submit",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_edit(app, socket, ack, true);
        },
    );
    socket.on(
        "wordsurvivor:pauseTimer",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_pause(app, socket, ack, true);
        },
    );
    socket.on(
        "wordsurvivor:resumeTimer",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            on_word_survivor_pause(app, socket, ack, false);
        },
    );
    socket.on(
        "wordsurvivor:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.word_survivor_admin = true);
            {
                let mut party = app.party.lock().expect("party");
                party
                    .word_survivor
                    .set_catalog(list_word_survivor_files(&resolve_word_survivor_dir()));
            }
            let _ = ack.send(&json!({ "ok": true }));
            emit_word_survivor_admin(&app, &socket);
        },
    );
    socket.on(
        "wordsurvivor:admin:select",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = select_word_survivor(&app, &payload);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsurvivor:admin:setSplash",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = set_word_survivor_splash(&app, &payload);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsurvivor:admin:reset",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let result = reset_word_survivor(&app, None);
            let _ = ack.send(&result);
            changed(&app);
        },
    );
    socket.on(
        "wordsurvivor:admin:resetPlayer",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let player_id = payload
                .get("playerId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if player_id.is_empty() {
                let _ = ack.send(&fail("Choose a player"));
                return;
            }
            let player_id = player_id.to_string();
            let result = reset_word_survivor(&app, Some(&player_id));
            let _ = ack.send(&result);
            changed(&app);
        },
    );

    socket.on(
        "system:admin:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            flag_mut(&app, &socket, |meta| meta.system_admin = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_system(&app, &socket);
        },
    );
    socket.on(
        "leaderboard:subscribe",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            flag_mut(&app, &socket, |meta| meta.leaderboard = true);
            let _ = ack.send(&json!({ "ok": true }));
            emit_leaderboard(&app, &socket);
        },
    );
    socket.on(
        "system:admin:kick",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            on_system_kick(app, payload, ack);
        },
    );
    socket.on(
        "system:admin:reset",
        async |socket: SocketRef, ack: AckSender, State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            on_system_reset(app, ack);
        },
    );
    socket.on(
        "system:admin:setTheme",
        async |socket: SocketRef,
               Data(payload): Data<Value>,
               ack: AckSender,
               State(app): State<Arc<App>>| {
            if !is_host(&app, &socket) {
                let _ = ack.send(&fail("Host passphrase required"));
                return;
            }
            let theme = payload
                .get("theme")
                .and_then(Value::as_str)
                .unwrap_or("");
            let result = {
                let mut party = app.party.lock().expect("party");
                match party.set_theme(theme) {
                    Ok(theme) => json!({ "ok": true, "theme": theme }),
                    Err(error) => fail(error),
                }
            };
            let _ = ack.send(&result);
            if result.get("ok").and_then(Value::as_bool) == Some(true) {
                emit_theme_all(&app);
                changed(&app);
            }
        },
    );

    socket.on_disconnect(async |socket: SocketRef, State(app): State<Arc<App>>| {
        let sid = sid_of(&socket);
        let meta = app.meta.lock().expect("meta").get(&sid).cloned();
        if let Some(meta) = meta {
            let mut party = app.party.lock().expect("party");
            if let Some(player_id) = meta.player_id.clone() {
                party.maze.pause_timer(&player_id);
                party.word_survivor.pause_timer(&player_id);
            }
            if meta.in_quizzer || meta.player_id.is_some() {
                party.quiz.mark_disconnected(&sid);
            }
            party.sessions.mark_disconnected(&sid);
        }
        app.meta.lock().expect("meta").remove(&sid);
        drop(socket);
        changed(&app);
    });
}

fn on_session_login(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let name = payload.get("name").and_then(Value::as_str).unwrap_or("");
    let player_id = payload
        .get("playerId")
        .and_then(Value::as_str)
        .map(str::to_string);
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
    let requested = payload
        .get("playerId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let sid = sid_of(&socket);
    let existing_id = {
        let meta = app.meta.lock().expect("meta");
        meta.get(&sid).and_then(|meta| meta.player_id.clone())
    };

    let (session_id, session_name) = if let Some(session_id) = existing_id {
        let name = {
            let party = app.party.lock().expect("party");
            party
                .sessions
                .get(&session_id)
                .map(|session| session.name.clone())
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
    let sid = sid_of(&socket);
    let player_id = {
        let meta = app.meta.lock().expect("meta");
        meta.get(&sid).and_then(|meta| meta.player_id.clone())
    };
    let Some(player_id) = player_id else {
        let _ = ack.send(&fail("Join the game first"));
        return;
    };
    let answer_id = payload
        .get("answerId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.quiz.submit_answer(&player_id, answer_id) {
            Ok(_) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_quiz_kick(app: Arc<App>, payload: Value, ack: AckSender) {
    let player_id = payload
        .get("playerId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let result = {
        let mut party = app.party.lock().expect("party");
        party.quiz.eject(&player_id)
    };
    match result {
        Ok(socket_id) => {
            if let Some(socket_id) = socket_id {
                if let Some(target) = find_socket(&app, &socket_id) {
                    let _ = target.emit("player:kicked", &json!({ "reason": QUIZ_REMOVAL_REASON }));
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
        party
            .sessions
            .get(&player_id)
            .map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.crossword.ensure_player(&player_id, &name);
    }
    flag_mut(&app, &socket, |meta| meta.crossword_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_crossword_player(&app, &socket);
    changed(&app);
}

fn on_crossword_letter(
    app: Arc<App>,
    socket: SocketRef,
    payload: Value,
    ack: AckSender,
    clear: bool,
) {
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
        party
            .sessions
            .get(&player_id)
            .map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.word_search.ensure_player(&player_id, &name);
    }
    flag_mut(&app, &socket, |meta| meta.wordsearch_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_wordsearch_player(&app, &socket);
    changed(&app);
}

fn on_wordsearch_selection(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
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

fn on_sudoku_subscribe(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let name = {
        let party = app.party.lock().expect("party");
        party
            .sessions
            .get(&player_id)
            .map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.sudoku.ensure_player(&player_id, &name);
    }
    flag_mut(&app, &socket, |meta| meta.sudoku_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_sudoku_player(&app, &socket);
    changed(&app);
}

fn on_sudoku_commit(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    let Some(player_id) = meta.player_id.clone().filter(|_| meta.sudoku_player) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some((row, col, value)) = placed_digit(&payload) else {
        let _ = ack.send(&fail("Invalid entry"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        party.sudoku.commit(&player_id, row, col, value)
    };
    let _ = ack.send(&match result {
        Ok(correct) => json!({ "ok": true, "correct": correct }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_sudoku_draft(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    let Some(player_id) = meta.player_id.clone().filter(|_| meta.sudoku_player) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some((row, col, value)) = placed_digit(&payload) else {
        let _ = ack.send(&fail("Invalid entry"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        party.sudoku.toggle_draft(&player_id, row, col, value)
    };
    let _ = ack.send(&match result {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_sudoku_erase(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    let Some(player_id) = meta.player_id.clone().filter(|_| meta.sudoku_player) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some((row, col)) = placed_cell(&payload) else {
        let _ = ack.send(&fail("Invalid cell"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        party.sudoku.erase(&player_id, row, col)
    };
    let _ = ack.send(&match result {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_sudoku_hint(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let sid = sid_of(&socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    let Some(player_id) = meta.player_id.clone().filter(|_| meta.sudoku_player) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let cell = placed_cell(&payload);
    let result = {
        let mut party = app.party.lock().expect("party");
        party.sudoku.hint(
            &player_id,
            cell.map(|(row, _)| row),
            cell.map(|(_, col)| col),
        )
    };
    let _ = ack.send(&match result {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    });
    changed(&app);
}

fn on_system_kick(app: Arc<App>, payload: Value, ack: AckSender) {
    let player_id = payload
        .get("playerId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
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
                    let _ =
                        target.emit("player:kicked", &json!({ "reason": SYSTEM_REMOVAL_REASON }));
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

fn on_system_reset(app: Arc<App>, ack: AckSender) {
    let socket_ids = {
        let mut party = app.party.lock().expect("party");
        party.reset_all()
    };
    let sockets = app.io.get().map(|io| io.sockets()).unwrap_or_default();
    for socket in sockets {
        let sid = sid_of(&socket);
        let has_player = {
            let meta = app.meta.lock().expect("meta");
            meta.get(&sid)
                .and_then(|entry| entry.player_id.clone())
                .is_some()
        };
        if !has_player && !socket_ids.iter().any(|id| id == &sid) {
            continue;
        }
        clear_player_flags(&app, &socket);
        let _ = socket.emit("player:kicked", &json!({ "reason": SYSTEM_REMOVAL_REASON }));
        let _ = socket.disconnect();
    }
    let _ = ack.send(&json!({ "ok": true }));
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

fn reset_sudoku(app: &App, only_player: Option<&str>) -> Value {
    let resume_ids = subscribed_sudoku(app, only_player);
    let mut party = app.party.lock().expect("party");
    if only_player.is_none() {
        let pending = party.sudoku.pending_puzzle_id().to_string();
        let active = party.sudoku.active_puzzle_id().to_string();
        if pending != active {
            match load_sudoku_puzzle(&pending, &resolve_sudoku_dir()) {
                Ok(puzzle) => {
                    if let Err(error) = party.sudoku.set_puzzle(puzzle) {
                        return fail(error);
                    }
                }
                Err(error) => return fail(error),
            }
        }
        party.sudoku.reset();
    } else if let Some(player_id) = only_player {
        if let Err(error) = party.sudoku.reset_player(player_id) {
            return fail(error);
        }
    }
    for player_id in resume_ids {
        party.sudoku.resume_timer(&player_id);
    }
    json!({ "ok": true })
}

fn on_maze_subscribe(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let name = {
        let party = app.party.lock().expect("party");
        party
            .sessions
            .get(&player_id)
            .map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        party.maze.ensure_player(&player_id, &name);
    }
    flag_mut(&app, &socket, |meta| meta.maze_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_maze_player(&app, &socket);
    changed(&app);
}

fn maze_player_id(app: &App, socket: &SocketRef) -> Option<String> {
    let sid = sid_of(socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    meta.player_id.filter(|_| meta.maze_player)
}

fn on_maze_ack(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = maze_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.maze.ack_intro(&player_id) {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_maze_move(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let Some(player_id) = maze_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let Some(direction) = payload
        .get("direction")
        .and_then(Value::as_str)
        .and_then(MazeDirection::parse)
    else {
        let _ = ack.send(&fail("Invalid move"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.maze.move_player(&player_id, direction) {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_maze_restart(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = maze_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.maze.restart(&player_id) {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_maze_pause(app: Arc<App>, socket: SocketRef, ack: AckSender, pause: bool) {
    let Some(player_id) = maze_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        if pause {
            party.maze.pause_timer(&player_id);
        } else {
            party.maze.resume_timer(&player_id);
        }
    }
    let _ = ack.send(&json!({ "ok": true }));
    changed(&app);
}

fn on_word_survivor_subscribe(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = player_id_of(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let name = {
        let party = app.party.lock().expect("party");
        party
            .sessions
            .get(&player_id)
            .map(|session| session.name.clone())
    };
    let Some(name) = name else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        if !party.word_survivor.has_player(&player_id) {
            refresh_word_survivor(&mut party);
        }
        party.word_survivor.ensure_player(&player_id, &name);
    }
    flag_mut(&app, &socket, |meta| meta.word_survivor_player = true);
    let _ = ack.send(&json!({ "ok": true }));
    emit_word_survivor_player(&app, &socket);
    changed(&app);
}

fn word_survivor_player_id(app: &App, socket: &SocketRef) -> Option<String> {
    let sid = sid_of(socket);
    let meta = app
        .meta
        .lock()
        .expect("meta")
        .get(&sid)
        .cloned()
        .unwrap_or_default();
    meta.player_id.filter(|_| meta.word_survivor_player)
}

fn on_word_survivor_ack(app: Arc<App>, socket: SocketRef, ack: AckSender) {
    let Some(player_id) = word_survivor_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.word_survivor.ack_intro(&player_id) {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_word_survivor_letter(app: Arc<App>, socket: SocketRef, payload: Value, ack: AckSender) {
    let Some(player_id) = word_survivor_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let letter = payload
        .get("letter")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let result = {
        let mut party = app.party.lock().expect("party");
        match party.word_survivor.type_letter(&player_id, &letter) {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_word_survivor_edit(app: Arc<App>, socket: SocketRef, ack: AckSender, submit: bool) {
    let Some(player_id) = word_survivor_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    let result = {
        let mut party = app.party.lock().expect("party");
        let outcome = if submit {
            party.word_survivor.submit(&player_id)
        } else {
            party.word_survivor.backspace(&player_id)
        };
        match outcome {
            Ok(()) => json!({ "ok": true }),
            Err(error) => fail(error),
        }
    };
    let _ = ack.send(&result);
    changed(&app);
}

fn on_word_survivor_pause(app: Arc<App>, socket: SocketRef, ack: AckSender, pause: bool) {
    let Some(player_id) = word_survivor_player_id(&app, &socket) else {
        let _ = ack.send(&fail("Log in first"));
        return;
    };
    {
        let mut party = app.party.lock().expect("party");
        if pause {
            party.word_survivor.pause_timer(&player_id);
        } else {
            party.word_survivor.resume_timer(&player_id);
        }
    }
    let _ = ack.send(&json!({ "ok": true }));
    changed(&app);
}

fn refresh_word_survivor(party: &mut party::system_admin::SystemAdmin) {
    let dir = resolve_word_survivor_dir();
    party
        .word_survivor
        .set_catalog(list_word_survivor_files(&dir));
    let id = party.word_survivor.file_id().to_string();
    match load_word_survivor_file(&id, &dir) {
        Ok(lists) => party.word_survivor.replace_lists(lists),
        Err(error) => party.word_survivor.note_load_error(error),
    }
}

fn select_word_survivor(app: &App, payload: &Value) -> Value {
    let file_id = payload
        .get("fileId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if file_id.is_empty() {
        return fail("Select a word list");
    }
    let topic = payload
        .get("topic")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let dir = resolve_word_survivor_dir();
    let lists = match load_word_survivor_file(file_id, &dir) {
        Ok(lists) => lists,
        Err(error) => return fail(error),
    };
    let mut party = app.party.lock().expect("party");
    if let Err(error) = party
        .word_survivor
        .apply_selection(file_id.to_string(), lists, &topic)
    {
        return fail(error);
    }
    party
        .word_survivor
        .set_catalog(list_word_survivor_files(&dir));
    let label = party
        .word_survivor
        .admin_snapshot()
        .files
        .into_iter()
        .find(|file| file.id == file_id)
        .map(|file| file.label)
        .unwrap_or_else(|| file_id.to_string());
    json!({ "ok": true, "message": format!("{label} accepted") })
}

fn set_word_survivor_splash(app: &App, payload: &Value) -> Value {
    let Some(seconds) = payload.get("seconds").and_then(value_i64) else {
        return fail("Choose a splash time");
    };
    let mut party = app.party.lock().expect("party");
    match party
        .word_survivor
        .set_splash_ms(seconds.saturating_mul(1000))
    {
        Ok(()) => json!({ "ok": true }),
        Err(error) => fail(error),
    }
}

fn reset_word_survivor(app: &App, only_player: Option<&str>) -> Value {
    let mut party = app.party.lock().expect("party");
    refresh_word_survivor(&mut party);
    if only_player.is_none() {
        party.word_survivor.reset();
    } else if let Some(player_id) = only_player {
        if let Err(error) = party.word_survivor.reset_player(player_id) {
            return fail(error);
        }
    }
    json!({ "ok": true })
}

fn select_maze(app: &App, payload: &Value) -> Value {
    let Some(difficulty) = payload
        .get("difficulty")
        .and_then(Value::as_str)
        .and_then(MazeDifficulty::parse)
    else {
        return fail("Choose a difficulty");
    };
    select_named(payload, "puzzleId", "Select a maze", |id| {
        let mut party = app.party.lock().expect("party");
        party.maze.select_puzzle(difficulty, id)
    })
}

fn reset_maze(app: &App, only_player: Option<&str>) -> Value {
    let mut party = app.party.lock().expect("party");
    if only_player.is_none() {
        for difficulty in [
            MazeDifficulty::Easy,
            MazeDifficulty::Medium,
            MazeDifficulty::Hard,
        ] {
            let pending = party.maze.pending_id(difficulty).to_string();
            let active = party.maze.active_id(difficulty).to_string();
            if pending == active {
                continue;
            }
            match load_maze_puzzle(
                &pending,
                &maze_difficulty_dir(&resolve_maze_dir(), difficulty),
                difficulty,
            ) {
                Ok(puzzle) => {
                    if let Err(error) = party.maze.set_puzzle(difficulty, puzzle) {
                        return fail(error);
                    }
                }
                Err(error) => return fail(error),
            }
        }
        party.maze.reset();
    } else if let Some(player_id) = only_player {
        if let Err(error) = party.maze.reset_player(player_id) {
            return fail(error);
        }
    }
    json!({ "ok": true })
}

fn subscribed_sudoku(app: &App, only_player: Option<&str>) -> Vec<String> {
    app.meta
        .lock()
        .expect("meta")
        .values()
        .filter(|meta| meta.sudoku_player)
        .filter_map(|meta| meta.player_id.clone())
        .filter(|id| only_player.is_none_or(|wanted| wanted == id))
        .collect()
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
    let Some(id) = payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
    else {
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
    if list.len() > 144 {
        return None;
    }
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

fn placed_cell(payload: &Value) -> Option<(i64, i64)> {
    let row = payload.get("row").and_then(value_i64)?;
    let col = payload.get("col").and_then(value_i64)?;
    Some((row, col))
}

fn placed_digit(payload: &Value) -> Option<(i64, i64, i64)> {
    let (row, col) = placed_cell(payload)?;
    let value = payload.get("value").and_then(value_i64)?;
    Some((row, col, value))
}

fn displace(app: &App, socket_id: Option<&str>) {
    let Some(socket_id) = socket_id else {
        return;
    };
    let Some(target) = find_socket(app, socket_id) else {
        return;
    };
    if let Some(meta) = app
        .meta
        .lock()
        .expect("meta")
        .get_mut(&target.id.to_string())
    {
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
    if let Some(meta) = app
        .meta
        .lock()
        .expect("meta")
        .get_mut(&socket.id.to_string())
    {
        meta.player_id = None;
        meta.in_quizzer = false;
        meta.crossword_player = false;
        meta.wordsearch_player = false;
        meta.sudoku_player = false;
        meta.maze_player = false;
        meta.word_survivor_player = false;
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
        if meta.sudoku_player {
            emit_sudoku_player(&app, &socket);
        }
        if meta.sudoku_admin {
            emit_sudoku_admin(&app, &socket);
        }
        if meta.maze_player {
            emit_maze_player(&app, &socket);
        }
        if meta.maze_admin {
            emit_maze_admin(&app, &socket);
        }
        if meta.word_survivor_player {
            emit_word_survivor_player(&app, &socket);
        }
        if meta.word_survivor_admin {
            emit_word_survivor_admin(&app, &socket);
        }
        if meta.system_admin {
            emit_system(&app, &socket);
        }
        if meta.leaderboard {
            emit_leaderboard(&app, &socket);
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

fn emit_sudoku_player(app: &App, socket: &SocketRef) {
    let Some(player_id) = player_id_of(app, socket) else {
        return;
    };
    let party = app.party.lock().expect("party");
    let Some(snapshot) = party.sudoku.player_snapshot(&player_id) else {
        return;
    };
    drop(party);
    let _ = socket.emit("sudoku:state", &snapshot);
}

fn emit_sudoku_admin(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.sudoku.admin_snapshot();
    drop(party);
    let _ = socket.emit("sudoku:admin:state", &snapshot);
}

fn emit_maze_player(app: &App, socket: &SocketRef) {
    let Some(player_id) = player_id_of(app, socket) else {
        return;
    };
    let party = app.party.lock().expect("party");
    let Some(snapshot) = party.maze.player_snapshot(&player_id) else {
        return;
    };
    drop(party);
    let _ = socket.emit("maze:state", &snapshot);
}

fn emit_maze_admin(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.maze.admin_snapshot();
    drop(party);
    let _ = socket.emit("maze:admin:state", &snapshot);
}

fn emit_word_survivor_player(app: &App, socket: &SocketRef) {
    let Some(player_id) = player_id_of(app, socket) else {
        return;
    };
    let party = app.party.lock().expect("party");
    let Some(snapshot) = party.word_survivor.player_snapshot(&player_id) else {
        return;
    };
    drop(party);
    let _ = socket.emit("wordsurvivor:state", &snapshot);
}

fn emit_word_survivor_admin(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.word_survivor.admin_snapshot();
    drop(party);
    let _ = socket.emit("wordsurvivor:admin:state", &snapshot);
}

fn emit_theme(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let theme = party.theme;
    drop(party);
    let _ = socket.emit("party:theme", &json!({ "theme": theme }));
}

fn emit_theme_all(app: &App) {
    let Some(io) = app.io.get() else {
        return;
    };
    for socket in io.sockets() {
        emit_theme(app, &socket);
    }
}

fn emit_leaderboard(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.leaderboard();
    drop(party);
    let _ = socket.emit("leaderboard:state", &snapshot);
}

fn emit_system(app: &App, socket: &SocketRef) {
    let party = app.party.lock().expect("party");
    let snapshot = party.snapshot();
    drop(party);
    let _ = socket.emit("system:admin:state", &snapshot);
}

fn is_host(app: &App, socket: &SocketRef) -> bool {
    app.meta
        .lock()
        .expect("meta")
        .get(&sid_of(socket))
        .is_some_and(|meta| meta.host)
}

fn secrets_match(expected: &str, provided: &str) -> bool {
    let expected = expected.as_bytes();
    let provided = provided.as_bytes();
    if expected.len() != provided.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in expected.iter().zip(provided) {
        diff |= left ^ right;
    }
    diff == 0
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
