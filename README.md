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

The production image uses official `node:22-alpine` images from Docker Hub. One container serves the Express/Socket.IO API and the built React client on port **8080**.

```bash
docker build -t quizzer .
docker run -p 8080:8080 quizzer
```

Then open `http://localhost:8080/play` and `http://localhost:8080/host/admin`.

## Releases

Pushes to `main` run [semantic-release](https://semantic-release.gitbook.io/) when commits follow [Conventional Commits](https://www.conventionalcommits.org/) (for example `feat:`, `fix:`, `feat!:`).

On each new version it:

1. Bumps `package.json`, updates `CHANGELOG.md`, and tags `vX.Y.Z`
2. Creates a [GitHub Release](https://github.com/brycekwan/quizzer/releases)
3. Builds the Docker image and publishes it to GHCR as `ghcr.io/brycekwan/quizzer:X.Y.Z` (and `:latest`)

## Game notes

- Server owns timers; late joiners only get remaining question time.
- Pause only after a question (leaderboard phase); clients stay on the leaderboard with a paused banner.
- Scores are a running sum; reset zeros totals and returns to waiting.
