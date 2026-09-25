use std::path::{Component, Path, PathBuf};

use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Json;
use axum::Router;
use serde_json::json;
use tower_http::cors::CorsLayer;

pub fn http_router(public_dir: PathBuf) -> Router {
    let dir = public_dir.clone();
    Router::new()
        .route("/api/health", get(health))
        .fallback(move |request: Request| serve(dir.clone(), request))
        .layer(CorsLayer::permissive())
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true }))
}

async fn serve(public_dir: PathBuf, request: Request) -> Response {
    let path = request.uri().path();
    if path.starts_with("/api") || path.starts_with("/socket.io") {
        return StatusCode::NOT_FOUND.into_response();
    }

    if let Some(file) = safe_file(&public_dir, path) {
        if file.is_file() {
            return file_response(&file).await;
        }
    }

    let index = public_dir.join("index.html");
    if index.is_file() {
        return file_response(&index).await;
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from("Web client not built yet."))
        .unwrap()
}

fn safe_file(public_dir: &Path, uri_path: &str) -> Option<PathBuf> {
    let mut path = public_dir.to_path_buf();
    let uri = Uri::from_maybe_shared(uri_path.as_bytes().to_vec()).ok()?;
    let requested = uri.path().trim_start_matches('/');
    if requested.is_empty() {
        return None;
    }
    for component in Path::new(requested).components() {
        match component {
            Component::Normal(part) => path.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(path)
}

async fn file_response(path: &Path) -> Response {
    match tokio::fs::read(path).await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type(path))
            .body(Body::from(bytes))
            .unwrap(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") | Some("map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}
