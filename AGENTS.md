# Party (Quizzer + more)

Multi-game party platform: Kahoot-style quizzer, crossword, and word search. Server-authoritative via Socket.IO; one React SPA for players and host admin.

## Stack

- **Nx** monorepo: `apps/web`, `apps/server`, `libs/shared`
- React 19 + Vite + Tailwind + Radix/shadcn-style UI + React Router
- Express + Socket.IO
- Vitest + ESLint; TypeScript strict
- Shared package import: `@party/shared` → `libs/shared/src`

## Layout

| Path | Role |
|------|------|
| `apps/web/src/pages/` | Login, menus, `PlayPage` (`/quizzer`), crossword and word search play/admin |
| `apps/web/src/hooks/useSession.ts` | Platform login (`session:login`) |
| `apps/web/src/hooks/useGameSocket.ts` | Quizzer socket |
| `apps/web/src/hooks/useCrosswordSocket.ts` | Crossword play/admin socket |
| `apps/web/src/hooks/useWordSearchSocket.ts` | Word search play/admin socket |
| `apps/web/src/components/crossword/` | Grid + clue list |
| `apps/web/src/components/wordsearch/` | Word search grid |
| `apps/server/src/session/` | Unique name + one active connection |
| `apps/server/src/quizzer/` | Game engine, socket handlers, question loader |
| `apps/server/src/crossword/` | Crossword engine, handlers, puzzle loader |
| `apps/server/src/wordsearch/` | Word search engine, handlers, puzzle loader |
| `apps/server/questions/*.json` | Quizzer question packs |
| `apps/server/crossword/puzzles/*.json` | Crossword packs (grid-first) |
| `apps/server/wordsearch/puzzles/*.json` | Word search packs (20×20 grid + placements) |
| `libs/shared/src/` | Types, scoring, names, crossword and word search validation |

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
| `/wordsearch` | Word search play |
| `/host` | Host menu |
| `/host/quizzer` | Quizzer admin (`/host/admin` redirects here) |
| `/host/crossword` | Crossword admin + reset |
| `/host/wordsearch` | Word search admin, leaderboard, per-player reset |

## Architecture rules

- **Platform session first.** `session:login` owns name uniqueness and single-connection displace.
- **Server owns time** for quizzer timers; crossword and word search progress are server-authoritative.
- **Shared logic in `@party/shared`.** Crossword answers are derived from the grid; word search placements are validated against the grid. Clients get a public puzzle without solutions.
- **One quiz room / one crossword / one word search.** In-process singletons; no multi-room or DB.
- Quiz reset clears quiz players (session kept). Crossword reset clears letters/completions for current players. Word search reset clears found words and play time.

## Crossword packs

JSON under `apps/server/crossword/puzzles/`: `{ id, title, grid, across, down }`. `grid` cells are solution letters or `null` blocks. Clues only need `number`, `row`, `col`, `clue` — answers are walked from the grid. Max 5 across and 5 down. Validate via `validateCrosswordFile`.

## Word search packs

JSON under `apps/server/wordsearch/puzzles/`: `{ id, title, grid, words }`. `grid` is a 20×20 array of letters. Each of the ten `words` is `{ word, row, col, direction }` with `direction` one of `E W N S NE NW SE SW`. The word is walked from that cell; filler letters fill the rest. Validate via `validateWordSearchFile`. The server accepts only those declared placements.

## Socket events (high level)

| Client → server | Purpose |
|-----------------|---------|
| `session:login` | Platform join / rejoin |
| `player:join` / `player:answer` | Quizzer |
| `admin:*` | Quizzer host controls |
| `crossword:subscribe` | Enter crossword (requires session) |
| `crossword:setLetter` / `clearLetter` | Fill cells |
| `crossword:admin:subscribe` / `reset` | Crossword host |
| `wordsearch:subscribe` | Enter word search (requires session) |
| `wordsearch:submitSelection` | Submit a selected cell path |
| `wordsearch:admin:subscribe` / `selectPuzzle` / `reset` / `resetPlayer` | Word search host |

Server → client: `game:state`, `game:reset`, `player:kicked`, `crossword:state`, `crossword:admin:state`, `wordsearch:state`, `wordsearch:admin:state`.

## Conventions

- Prefer colocated `*.spec.ts` next to the unit under test.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/).
- UI primitives in `apps/web/src/components/ui/`; use `cn` from `lib/utils`.
