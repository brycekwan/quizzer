# Quizzer

Real-time, Kahoot-style quiz (single room). Server-authoritative clock via Socket.IO; React clients for players and host admin.

## Stack

- **Nx** monorepo: `apps/web`, `apps/server`, `libs/shared`
- React 19 + Vite + Tailwind + Radix/shadcn-style UI + React Router
- Express + Socket.IO
- Vitest + ESLint; TypeScript strict
- Shared package import: `@quizzer/shared` → `libs/shared/src`

## Layout

| Path | Role |
|------|------|
| `apps/web/src/pages/` | `PlayPage` (`/play`), `AdminPage` (`/host/admin`) |
| `apps/web/src/hooks/useGameSocket.ts` | Socket client, localStorage rejoin |
| `apps/web/src/components/` | Game UI (`AnswerGrid`, `Countdown`, `Leaderboard`, `ui/*`) |
| `apps/server/src/game/GameEngine.ts` | Authoritative game state, timers, scoring apply |
| `apps/server/src/socket/handlers.ts` | Socket events ↔ engine; per-socket `game:state` |
| `apps/server/questions/*.json` | Question packs (host picks via admin) |
| `libs/shared/src/` | Types, scoring, name/config validation |

## Commands

```bash
npm run dev      # web :4200 + server :8080 (web proxies /socket.io)
npm test         # Vitest via Nx
npm run lint
npm run build
```

Prod: one Docker image serves API + built web on **8080**.

## Architecture rules

- **Server owns time.** Clients render from `GameStateSnapshot` (`remainingMs`, `questionEndsAt`, `phaseEndsAt`, `serverNow`). Do not drive question timers from the browser.
- **Shared logic lives in `@quizzer/shared`** (scoring, name rules, config validation, types). Keep web/server in sync by changing shared first.
- **One room.** `GameEngine` is a singleton in-process; no multi-room or DB.
- **Snapshots are role-aware.** `getSnapshot(role, playerId)` — correct flags / `viewerAnswer` / `viewerFinishedGame` depend on who receives them.
- **Phases:** `waiting` → `active` with `multiplier` → `answering` → `reveal` → `leaderboard` (repeat) → `finished`. Pause only on leaderboard; reset kicks everyone and clears scores.

## Socket events (high level)

| Client → server | Purpose |
|-----------------|---------|
| `player:join` | Join / rejoin (`playerId` in localStorage) |
| `player:answer` | Submit answer during answering |
| `admin:subscribe` | Mark socket as admin |
| `admin:start` / `pause` / `resume` / `reset` | Host controls |
| `admin:config` | Partial `GameConfig` |
| `admin:questionSet` | Switch pack by id |
| `admin:kick` | Remove player |

Server → client: `game:state`, `game:reset`, `player:kicked`.

## Question packs

JSON under `apps/server/questions/`: `{ "questions": [ { id, question, answers: [{ id, text, correct }], score?, multiplier? } ] }`. Id = filename without `.json` (e.g. `dog-facts`). Validate via `validateQuestionsFile` in shared.

## Conventions

- Prefer colocated `*.spec.ts` next to the unit under test (engine, handlers, shared, web utils).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`) — releases via semantic-release on `main`.
- UI primitives: `apps/web/src/components/ui/` (button, dialog, input, label); use `cn` from `lib/utils`.
- Keep changes scoped: game rules in `GameEngine` + shared; transport only in `handlers.ts`; UI only in web.
