use std::path::{Component, Path, PathBuf};

use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, StatusCode, Uri};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Json;
use axum::Router;
use serde_json::json;

pub fn http_router(public_dir: PathBuf) -> Router {
    let dir = public_dir.clone();
    Router::new()
        .route("/api/health", get(health))
        .fallback(move |request: Request| serve(dir.clone(), request))
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true }))
}

/// Rejects browser requests whose Origin host is not this server.
/// Socket.IO has no origin allowlist, so this runs in front of that layer too.
/// A missing Origin is allowed for non-browser clients such as the contract tests.
pub async fn reject_cross_origin(request: Request, next: Next) -> Response {
    let allowed = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_none_or(|origin| {
            let host = request
                .headers()
                .get(header::HOST)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("");
            origin_matches_host(origin, host)
        });
    if !allowed {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(request).await
}

fn origin_matches_host(origin: &str, host_header: &str) -> bool {
    let Ok(origin) = origin.parse::<Uri>() else {
        return false;
    };
    let Some(origin_host) = origin.host() else {
        return false;
    };
    let (name, port) = split_host(host_header);
    if !origin_host.eq_ignore_ascii_case(name) {
        return false;
    }
    let origin_port = origin.port_u16().unwrap_or(match origin.scheme_str() {
        Some("https") => 443,
        Some("http") => 80,
        _ => return false,
    });
    match port {
        Some(host_port) => origin_port == host_port,
        None => matches!(origin_port, 80 | 443),
    }
}

fn split_host(host_header: &str) -> (&str, Option<u16>) {
    if let Some(rest) = host_header.strip_prefix('[') {
        if let Some((name, port)) = rest.split_once("]:") {
            return (name, port.parse().ok());
        }
        if let Some(name) = rest.strip_suffix(']') {
            return (name, None);
        }
    }
    if let Some((name, port)) = host_header.rsplit_once(':') {
        if !name.contains(':') {
            if let Ok(port) = port.parse::<u16>() {
                return (name, Some(port));
            }
        }
    }
    (host_header, None)
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

#[cfg(test)]
mod tests {
    use super::origin_matches_host;

    #[test]
    fn allows_the_same_host_and_port() {
        assert!(origin_matches_host(
            "http://localhost:4200",
            "localhost:4200"
        ));
        assert!(origin_matches_host(
            "https://party.example",
            "party.example"
        ));
    }

    #[test]
    fn rejects_a_different_origin() {
        assert!(!origin_matches_host(
            "http://evil.example",
            "party.example:8080"
        ));
        assert!(!origin_matches_host(
            "http://localhost:4200",
            "localhost:8080"
        ));
    }
}
