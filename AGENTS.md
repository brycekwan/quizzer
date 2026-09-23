# Party (Quizzer + more)

Multi-game party platform. Today: Kahoot-style quizzer (single room) plus crossword stubs. Server-authoritative clock via Socket.IO; one React SPA for players and host admin.

## Stack

- **Nx** monorepo: `apps/web`, `apps/server`, `libs/shared`
- React 19 + Vite + Tailwind + Radix/shadcn-style UI + React Router
- Express + Socket.IO
- Vitest + ESLint; TypeScript strict
- Shared package import: `@party/shared` → `libs/shared/src`

## Layout

| Path | Role |
|------|------|
| `apps/web/src/pages/` | `LoginPage` (`/login`), `MenuPage` (`/`), `PlayPage` (`/quizzer`), `AdminPage` (`/host/quizzer`), crossword stubs |
| `apps/web/src/hooks/useSession.ts` | Platform login (`session:login`), localStorage |
| `apps/web/src/hooks/useGameSocket.ts` | Quizzer socket; rejoins session then `player:join` |
| `apps/web/src/components/` | Game UI (`AnswerGrid`, `Countdown`, `Leaderboard`, `ui/*`) |
| `apps/server/src/session/` | Unique name + one active connection |
| `apps/server/src/quizzer/game/GameEngine.ts` | Authoritative quizzer state, timers, scoring |
| `apps/server/src/quizzer/socket/handlers.ts` | Quizzer + session socket events |
| `apps/server/src/quizzer/questions/` | Question pack loader |
| `apps/server/src/crossword/` | Crossword server code (phase 2+) |
| `apps/server/crossword/puzzles/` | Crossword JSON packs (phase 2+) |
| `apps/server/questions/*.json` | Quizzer question packs |
| `libs/shared/src/` | Types, scoring, name/config validation |

## Commands

```bash
npm run dev      # web :4200 + server :8080 (web proxies /socket.io)
npm test         # Vitest via Nx
npm run lint
npm run build
```

Prod: one Docker image serves API + built web on **8080**.

## Routes

| Route | Purpose |
|-------|---------|
| `/login` | Unique display name |
| `/` | Player main menu |
| `/quizzer` | Quiz play (`/play` redirects here) |
| `/crossword` | Crossword (stub) |
| `/host` | Host menu |
| `/host/quizzer` | Quizzer admin (`/host/admin` redirects here) |
| `/host/crossword` | Crossword admin (stub) |

## Architecture rules

- **Platform session first.** `session:login` owns name uniqueness and single-connection displace. Entering Quizzer calls `player:join` with that identity.
- **Server owns time.** Clients render from `GameStateSnapshot` (`remainingMs`, `questionEndsAt`, `phaseEndsAt`, `serverNow`). Do not drive question timers from the browser.
- **Shared logic lives in `@party/shared`** (scoring, name rules, config validation, types). Keep web/server in sync by changing shared first.
- **One quiz room.** `GameEngine` is a singleton in-process; no multi-room or DB.
- **Snapshots are role-aware.** `getSnapshot(role, playerId)` — correct flags / `viewerAnswer` / `viewerFinishedGame` depend on who receives them.
- **Phases:** `waiting` → `active` with `multiplier` → `answering` → `reveal` → `leaderboard` (repeat) → `finished`. Pause only on leaderboard; quiz reset clears quiz players (platform session kept).

## Socket events (high level)

| Client → server | Purpose |
|-----------------|---------|
| `session:login` | Platform join / rejoin (`playerId` in localStorage) |
| `player:join` | Enter quizzer room (uses session; can auto-login) |
| `player:answer` | Submit answer during answering |
| `admin:subscribe` | Mark socket as admin |
| `admin:start` / `pause` / `resume` / `reset` | Host controls |
| `admin:config` | Partial `GameConfig` |
| `admin:questionSet` | Switch pack by id |
| `admin:kick` | Remove player (quiz + session) |

Server → client: `game:state`, `game:reset`, `player:kicked`.

## Question packs

JSON under `apps/server/questions/`: `{ "questions": [ { id, question, answers: [{ id, text, correct }], score?, multiplier? } ] }`. Id = filename without `.json` (e.g. `dog-facts`). Validate via `validateQuestionsFile` in shared.

## Conventions

- Prefer colocated `*.spec.ts` next to the unit under test (engine, handlers, shared, web utils).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`) — releases via semantic-release on `main`.
- UI primitives: `apps/web/src/components/ui/` (button, dialog, input, label); use `cn` from `lib/utils`.
- Keep changes scoped: quizzer rules in `quizzer/game` + shared; transport in `quizzer/socket/handlers.ts`; UI only in web.
