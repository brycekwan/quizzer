# Web assets, Rust server, distroless runtime. One image, port 8080.

FROM node:26-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NX_DAEMON=false
RUN npx nx build web

FROM rust:1.98.1-bookworm AS rust
WORKDIR /src
COPY rust-toolchain.toml Cargo.toml Cargo.lock ./
COPY libs/party libs/party
COPY apps/server-rs apps/server-rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p server-rs \
    && cp /src/target/release/party-server /party-server

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=rust /party-server /app/party-server
COPY --from=web /app/dist/apps/web /app/public
COPY apps/server/questions /app/questions
COPY apps/server/crossword/puzzles /app/crossword/puzzles
COPY apps/server/wordsearch/puzzles /app/wordsearch/puzzles
ENV PORT=8080
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/public
ENV QUESTIONS_DIR=/app/questions
ENV CROSSWORD_PUZZLES_DIR=/app/crossword/puzzles
ENV WORDSEARCH_PUZZLES_DIR=/app/wordsearch/puzzles
EXPOSE 8080
ENTRYPOINT ["/app/party-server"]
