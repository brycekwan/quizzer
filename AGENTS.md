# Party (Quizzer + more)

Multi-game party platform: Kahoot-style quizzer and crossword. Server-authoritative via Socket.IO; one React SPA for players and host admin.

## Stack

- **Nx** monorepo: `apps/web`, `apps/server`, `libs/shared`
- React 19 + Vite + Tailwind + Radix/shadcn-style UI + React Router
- Express + Socket.IO
- Vitest + ESLint; TypeScript strict
- Shared package import: `@party/shared` → `libs/shared/src`

## Layout

| Path | Role |
|------|------|
| `apps/web/src/pages/` | Login, menus, `PlayPage` (`/quizzer`), crossword play/admin |
| `apps/web/src/hooks/useSession.ts` | Platform login (`session:login`) |
| `apps/web/src/hooks/useGameSocket.ts` | Quizzer socket |
| `apps/web/src/hooks/useCrosswordSocket.ts` | Crossword play/admin socket |
| `apps/web/src/components/crossword/` | Grid + clue list |
| `apps/server/src/session/` | Unique name + one active connection |
| `apps/server/src/quizzer/` | Game engine, socket handlers, question loader |
| `apps/server/src/crossword/` | Crossword engine, handlers, puzzle loader |
| `apps/server/questions/*.json` | Quizzer question packs |
| `apps/server/crossword/puzzles/*.json` | Crossword packs (grid-first) |
| `libs/shared/src/` | Types, scoring, names, crossword validation |

## Commands

```bash
npm run dev      # web :4200 + server :8080 (web proxies /socket.io)
npm test
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
| `/crossword` | Crossword play |
| `/host` | Host menu |
| `/host/quizzer` | Quizzer admin (`/host/admin` redirects here) |
| `/host/crossword` | Crossword admin + reset |

## Architecture rules

- **Platform session first.** `session:login` owns name uniqueness and single-connection displace.
- **Server owns time** for quizzer timers; crossword progress is server-authoritative.
- **Shared logic in `@party/shared`.** Crossword answers are derived from the grid; clients get a public puzzle without solutions.
- **One quiz room / one crossword.** In-process singletons; no multi-room or DB.
- Quiz reset clears quiz players (session kept). Crossword reset clears letters/completions for current players.

## Crossword packs

JSON under `apps/server/crossword/puzzles/`: `{ id, title, grid, across, down }`. `grid` cells are solution letters or `null` blocks. Clues only need `number`, `row`, `col`, `clue` — answers are walked from the grid. Max 5 across and 5 down. Validate via `validateCrosswordFile`.

## Socket events (high level)

| Client → server | Purpose |
|-----------------|---------|
| `session:login` | Platform join / rejoin |
| `player:join` / `player:answer` | Quizzer |
| `admin:*` | Quizzer host controls |
| `crossword:subscribe` | Enter crossword (requires session) |
| `crossword:setLetter` / `clearLetter` | Fill cells |
| `crossword:admin:subscribe` / `reset` | Crossword host |

Server → client: `game:state`, `game:reset`, `player:kicked`, `crossword:state`, `crossword:admin:state`.

## Conventions

- Prefer colocated `*.spec.ts` next to the unit under test.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/).
- UI primitives in `apps/web/src/components/ui/`; use `cn` from `lib/utils`.
