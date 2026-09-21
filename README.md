# Quizzer

Real-time, Kahoot-style quiz for mobile and web. Single room, Socket.IO sync, time-based scoring, and a host admin console.

## Stack

- **Nx** monorepo (`apps/web`, `apps/server`, `libs/shared`)
- React + Vite + Tailwind + shadcn-style UI
- Express + Socket.IO (server-authoritative game clock)
- Vitest + ESLint (React hooks / a11y)

## Quick start

```bash
npm install
npm run dev
```

- Players: [http://localhost:4200/play](http://localhost:4200/play)
- Admin: [http://localhost:4200/host/admin](http://localhost:4200/host/admin)
- API/Socket server: [http://localhost:8080](http://localhost:8080) (web proxies `/socket.io` in dev)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Serve web + server |
| `npm test` | Run all tests |
| `npm run lint` | Run ESLint via Nx |
| `npm run build` | Build web + server |

## Docker

```bash
docker build -t quizzer .
docker run -p 8080:8080 quizzer
```

Then open `http://localhost:8080/play` and `http://localhost:8080/host/admin`.

GitHub Actions builds and pushes images to GHCR on `main` and `v*` tags.

## Game notes

- Server owns timers; late joiners only get remaining question time.
- Pause only after a question (leaderboard phase); clients stay on the leaderboard with a paused banner.
- Scores are a running sum; reset zeros totals and returns to waiting.
