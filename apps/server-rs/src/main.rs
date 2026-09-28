mod http;
mod socket;
mod state;

use std::env;
use std::io::ErrorKind;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use party::crossword_engine::CrosswordEngine;
use party::load::{
    load_default_crossword, load_default_question_set, load_default_sudoku,
    load_default_word_search, resolve_crossword_dir, resolve_questions_dir, resolve_sudoku_dir,
    resolve_word_search_dir,
};
use party::quizzer::GameEngine;
use party::session::SessionRegistry;
use party::sudoku_engine::SudokuEngine;
use party::system_admin::SystemAdmin;
use party::types::QuestionSetMode;
use party::word_search_engine::WordSearchEngine;
use socketioxide::SocketIo;
use tokio::net::TcpListener;
use tracing::info;

use crate::state::App;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let host_secret = require_host_secret()?;
    let party = load_party()?;
    let app = Arc::new(App::new(party, host_secret));

    let (layer, io) = SocketIo::builder().with_state(app.clone()).build_layer();
    app.io.set(io.clone()).expect("socket io set once");
    socket::register(&io);

    let timer_app = app.clone();
    tokio::spawn(async move {
        loop {
            let deadline = timer_app.party.lock().expect("party").quiz.next_deadline();
            let notified = timer_app.notify.notified();
            tokio::pin!(notified);
            if let Some(deadline) = deadline {
                let now = timer_app.party.lock().expect("party").quiz.clock().now();
                let wait = (deadline - now).max(0) as u64;
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_millis(wait)) => {
                        let changed = timer_app.party.lock().expect("party").quiz.fire_due();
                        if changed {
                            socket::broadcast(&timer_app);
                        }
                    }
                    _ = &mut notified => {}
                }
            } else {
                notified.await;
            }
        }
    });

    let public_dir = static_dir();
    let router = http::http_router(public_dir)
        .layer(layer)
        .layer(axum::middleware::from_fn(http::reject_cross_origin));
    let addr = bind_addr();
    let listener = TcpListener::bind(addr).await?;
    info!("party server listening on http://{addr}");
    axum::serve(listener, router).await?;
    Ok(())
}

fn require_host_secret() -> Result<String, Box<dyn std::error::Error>> {
    match dotenvy::dotenv() {
        Ok(_) => {}
        Err(dotenvy::Error::Io(error)) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let secret = env::var("HOST_SECRET").unwrap_or_default();
    let secret = secret.trim().to_string();
    if secret.is_empty() {
        eprintln!("HOST_SECRET is required");
        std::process::exit(1);
    }
    Ok(secret)
}

fn load_party() -> Result<SystemAdmin, Box<dyn std::error::Error>> {
    let questions_dir = resolve_questions_dir();
    let (question_set_id, questions) = load_default_question_set(&questions_dir)?;
    let sets = party::load::list_question_sets(&questions_dir);
    let quiz = GameEngine::with_options(
        questions,
        party::Clock::system(),
        Some(question_set_id.clone()),
        Some(vec![question_set_id.clone()]),
        Some(QuestionSetMode::Single),
        Some(sets),
    );

    let (crossword, words, puzzles) = load_default_crossword(&resolve_crossword_dir())?;
    let crossword = CrosswordEngine::with_clock(
        crossword,
        words,
        Some(puzzles),
        None,
        party::Clock::system(),
    );

    let (word_search, words, puzzles) = load_default_word_search(&resolve_word_search_dir())?;
    let word_search = WordSearchEngine::with_clock(
        word_search,
        words,
        Some(puzzles),
        None,
        party::Clock::system(),
    );

    let (sudoku, puzzles) = load_default_sudoku(&resolve_sudoku_dir())?;
    let sudoku = SudokuEngine::with_clock(sudoku, Some(puzzles), None, party::Clock::system())?;

    Ok(SystemAdmin::new(
        SessionRegistry::new(),
        quiz,
        crossword,
        word_search,
        sudoku,
    ))
}

fn static_dir() -> PathBuf {
    if let Ok(dir) = env::var("STATIC_DIR") {
        return PathBuf::from(dir);
    }
    let dist = PathBuf::from("dist/apps/web");
    if dist.is_dir() {
        return dist;
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist/apps/web")
}

fn bind_addr() -> SocketAddr {
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port = env::var("PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(8080);
    format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], port)))
}
