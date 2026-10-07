# Party (Quizzer + more)

Multi-game party platform: Kahoot-style quizzer, crossword, word search, sudoku, and maze. Server-authoritative via Socket.IO; one React SPA for players and host admin.

## Stack

- **Nx** monorepo: `apps/web`, `apps/server-rs`, `libs/party`, `libs/shared`
- React 19 + Vite + Tailwind + Radix/shadcn-style UI + React Router
- Rust server (Axum + socketioxide) speaking the Socket.IO protocol; `@party/shared` stays TypeScript for the web app
- Vitest + ESLint; TypeScript strict; Cargo tests for the server
- Shared package import: `@party/shared` → `libs/shared/src`

## Layout

| Path | Role |
|------|------|
| `apps/web/src/pages/` | Login, menus, `PlayPage` (`/quizzer`), crossword, word search, sudoku, and maze play/admin |
| `apps/web/src/hooks/useSession.ts` | Platform login (`session:login`) |
| `apps/web/src/hooks/useGameSocket.ts` | Quizzer socket |
| `apps/web/src/hooks/useCrosswordSocket.ts` | Crossword play/admin socket |
| `apps/web/src/hooks/useWordSearchSocket.ts` | Word search play/admin socket |
| `apps/web/src/hooks/useSudokuSocket.ts` | Sudoku play/admin socket |
| `apps/web/src/hooks/useMazeSocket.ts` | Maze play/admin socket |
| `apps/web/src/hooks/useWordSurvivorSocket.ts` | Word survivor play/admin socket |
| `apps/web/src/components/crossword/` | Grid + clue list |
| `apps/web/src/components/wordsearch/` | Word search grid |
| `apps/web/src/components/sudoku/` | Sudoku grid and number keyboard |
| `apps/web/src/components/maze/` | Maze grid, pad, and icons |
| `apps/web/src/components/wordsurvivor/` | Word survivor board and keyboard |
| `apps/server-rs/` | Rust binary: HTTP, static files, Socket.IO handlers (`party-server`) |
| `libs/party/` | Session registry, quizzer, crossword, word search, sudoku, maze, word survivor, system admin |
| `apps/server/questions/*.json` | Quizzer question packs |
| `apps/server/crossword/puzzles/*.json` | Crossword packs (grid-first) |
| `apps/server/wordsearch/puzzles/*.json` | Word search packs (12×12 grid + placements) |
| `apps/server/sudoku/puzzles/*.json` | Sudoku packs (solution + givens) |
| `apps/server/maze/{easy,medium,hard}/*.json` | Maze packs (open cells + edge walls) |
| `apps/server/wordsurvivor/*.json` | Word survivor lists: 5 through 9 letter words. `words.json` is the default |
| `libs/shared/src/` | Types, scoring, names, crossword, word search, sudoku, maze, and word survivor |

## Commands

```bash
npm run dev:free # stop listeners on :4200 and :8080
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
| `/sudoku` | Sudoku play |
| `/maze` | Maze campaign |
| `/wordsurvivor` | Word survivor |
| `/host` | Host menu |
| `/host/quizzer` | Quizzer admin (`/host/admin` redirects here) |
| `/host/crossword` | Crossword admin + reset |
| `/leaderboard` | Player leaderboard: top 10 per game, with the player's own rank |
| `/host/leaderboard` | Host leaderboard: overall and per-game scores with play time |
| `/host/wordsearch` | Word search admin and per-player reset |
| `/host/sudoku` | Sudoku admin and per-player reset |
| `/host/maze` | Maze admin: easy, medium, and hard files, and per-player reset |
| `/host/wordsurvivor` | Word survivor admin: word list, topic hint, splash time, and per-player reset |
| `/host/system` | Theme, connected players, remove from the party, reset all |

## Architecture rules

- **Platform session first.** `session:login` owns name uniqueness and single-connection displace. A stored player id can reclaim a session only after that socket has disconnected.
- **Host passphrase.** `HOST_SECRET` is required at process start. Host pages send it with `host:unlock`; admin and system events are rejected until that socket unlocks. Local dev reads a gitignored `.env`. `npm run dev` clears an exported `HOST_SECRET` so that file is used, because dotenv leaves an already-set variable in place. Production passes `-e HOST_SECRET` when the container starts.
- **Server owns time** for quizzer timers; crossword, word search, sudoku, maze, and word survivor progress are server-authoritative. Those play clocks run from the first move until the puzzle is finished. The maze clock also pauses while instructions or a level splash is showing, and while the player is away from `/maze`. The word survivor clock starts on the first letter and pauses during instructions, between words, and while the player is away from `/wordsurvivor`. Quiz correctness and points stay hidden until the reveal phase.
- **Shared logic in `@party/shared`.** Crossword answers are derived from the grid; word search placements are validated against the grid. Sudoku files carry a private solution and a starting grid. Maze files carry the open cells and the walls. Word survivor answers stay on the server. Clients get a public puzzle without sudoku solutions. The maze is fully visible.
- **One quiz room / one crossword / one word search / one sudoku / one maze campaign / one word survivor.** In-process singletons; no multi-room or DB.
- Quiz reset clears quiz players (session kept). Crossword reset clears letters/completions for current players. Word search reset clears found words and play time. Sudoku reset clears the board, score, hints, and clock. Maze reset returns a player to the easy maze with 3 lives. Changing a maze file waits for reset all. Word survivor reset returns a player to the first 5-letter word of the selected list. The host submits a file and an optional topic; new runs and resets use that file, and a non-blank topic shows above the board.

## Crossword packs

JSON under `apps/server/crossword/puzzles/`: `{ id, title, grid, across, down }`. `grid` cells are solution letters or `null` blocks. Clues only need `number`, `row`, `col`, `clue` — answers are walked from the grid. Max 5 across and 5 down. Validate via `validateCrosswordFile`.

## Word search packs

JSON under `apps/server/wordsearch/puzzles/`: `{ id, title, grid, words }`. `grid` is a 12×12 array of letters. Each of the ten `words` is `{ word, row, col, direction }` with `direction` one of `E W N S NE NW SE SW`. The word is walked from that cell; filler letters fill the rest. Validate via `validateWordSearchFile`. The server accepts only those declared placements.

## Sudoku packs

JSON under `apps/server/sudoku/puzzles/`: `{ id, title, solution, givens, alphabet? }`. Both grids are 9×9 with digits **1–9**. `solution` is the finished board. `givens` uses those digits or `null` for blanks. Optional `alphabet` is nine unique single-character symbols (e.g. `["B","U","R","P","T","O","W","E","L"]`) mapped to digits 1–9 for display on the soft keyboard, grid, and instructions; omit it for classic 1–9. The solution must be a valid sudoku and the only board that fits the givens. Validate via `validateSudokuFile`. Players receive givens and their own entries, not the solution.

## Maze packs

JSON under `apps/server/maze/easy/` (12×12), `medium/` (15×15), and `hard/` (20×20): `{ id, title, rows, cols, start, target, open, walls }`. `open` is a boolean grid of walkable cells. `walls` is the same size, and each cell is `{ n, e, s, w }` with `true` meaning a wall. Walls are symmetric and the outer border is closed. A player may move only up, down, left, or right into an open cell they have not visited. The host picks one file per difficulty; those choices load on reset all. Validate via `validateMazeFile`.

`scripts/convert-maze.mjs` turns a source grid (`{ width, height, grid }` with each cell `{ w: { top, right, bottom, left } }`, `true` = wall) into that pack. Easy must be 12×12, medium 15×15, and hard 20×20. `med` is accepted as medium. Coordinates are zero-based `row,col`.

```bash
node scripts/convert-maze.mjs maze_12x12.json easy 0,0 11,11 --out apps/server/maze/easy/maze-12x12.json --id maze-12x12 --title "Maze 12x12"
```

## Word survivor

Word survivor files under `apps/server/wordsurvivor/` list words under keys `"5"` through `"9"`. Each word is letters A–Z of that length, with no duplicates. A file needs at least 25 words, including at least 5 of each length from 5 through 9. The host topic is typed in admin and is blank unless they submit one. A run is 5 random words of each length, 5 letters first, then 6, and so on through 9. Any letters of the right length count as a guess. A correct word scores 100 plus 5 for each unused guess of the 5 allowed. The solved word stays green for 2 seconds, then the splash between words. The fifth miss ends the run. Clearing all 25 words wins.

## Socket events (high level)

| Client → server | Purpose |
|-----------------|---------|
| `session:login` | Platform join / rejoin |
| `host:unlock` | Present `HOST_SECRET` before any admin event |
| `player:join` / `player:answer` | Quizzer |
| `admin:*` | Quizzer host controls (requires unlock) |
| `crossword:subscribe` | Enter crossword (requires session) |
| `crossword:setLetter` / `clearLetter` | Fill cells |
| `crossword:admin:subscribe` / `reset` | Crossword host (requires unlock) |
| `wordsearch:subscribe` | Enter word search (requires session) |
| `wordsearch:submitSelection` | Submit a selected cell path |
| `wordsearch:admin:subscribe` / `selectPuzzle` / `reset` / `resetPlayer` | Word search host (requires unlock) |
| `sudoku:subscribe` | Enter sudoku (requires session) |
| `sudoku:commit` / `draft` / `erase` / `hint` | Fill a cell, toggle a note, clear a wrong note, or reveal one digit |
| `sudoku:admin:subscribe` / `selectPuzzle` / `reset` / `resetPlayer` | Sudoku host (requires unlock) |
| `maze:subscribe` | Enter the maze campaign (requires session) |
| `maze:ackIntro` | Start the easy splash after the instructions OK |
| `maze:move` / `restart` | One orthogonal step, or spend a life to restart the current maze |
| `maze:pauseTimer` / `resumeTimer` | Pause the campaign clock for instructions, splash, or leaving the page |
| `maze:admin:subscribe` / `select` / `reset` / `resetPlayer` | Maze host (requires unlock). `select` sends `{ difficulty, puzzleId }` |
| `wordsurvivor:subscribe` | Enter word survivor (requires session) |
| `wordsurvivor:ackIntro` | Dismiss the opening instructions |
| `wordsurvivor:letter` / `backspace` / `submit` | Type the current letter, erase the previous letter, or submit the word |
| `wordsurvivor:pauseTimer` / `resumeTimer` | Pause the clock for instructions, the splash, or leaving the page |
| `wordsurvivor:admin:subscribe` / `select` / `setSplash` / `reset` / `resetPlayer` | Word survivor host (requires unlock). `select` sends `{ fileId, topic }`. `setSplash` sends `{ seconds }` |
| `system:admin:subscribe` / `kick` | System host: connected players and remove from the party (requires unlock) |
| `leaderboard:subscribe` | Overall and per-game leaderboard (no host unlock; players and host both subscribe) |

Server → client: `game:state`, `game:reset`, `player:kicked`, `crossword:state`, `crossword:admin:state`, `wordsearch:state`, `wordsearch:admin:state`, `sudoku:state`, `sudoku:admin:state`, `maze:state`, `maze:admin:state`, `wordsurvivor:state`, `wordsurvivor:admin:state`, `system:admin:state`, `leaderboard:state`.

System removal emits `player:kicked` with reason `Removed from the system by admin`, clears that player's quiz, crossword, word search, sudoku, maze, and word survivor progress, and sends them to login. Crossword and word search each award 100 points per word, ranked by words then shorter time. Sudoku awards 10 points for each correct digit and −10 for each distinct wrong note in a cell. Finishing adds 100 points plus 10 for each unused hint (maximum 3). Sudoku ranking uses that score, then shorter time. The maze pays 200 for easy, 300 for medium, and 500 for hard, plus 50 for each heart still left when the run ends. Three lives are shared across the campaign. The maze board ranks by that score, then shorter time. Word survivor pays 100 for a correct word plus 5 for each unused guess. Its board ranks by that score, then shorter time. The party leaderboard sums crossword, word search, sudoku, maze, and word survivor scores and shows the quiz score separately. Equal overall scores break by shorter total play time.

## Conventions

- Prefer colocated `*.spec.ts` next to the unit under test.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/).
- UI primitives in `apps/web/src/components/ui/`; use `cn` from `lib/utils`.
