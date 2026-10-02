import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { loginRedirect } from '@/lib/returnPath';
import { readStoredSession } from '@/lib/sessionStorage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { PlayPage } from './pages/PlayPage';
import { AdminPage } from './pages/AdminPage';
import { HostMenuPage } from './pages/HostMenuPage';
import { CrosswordPage } from './pages/CrosswordPage';
import { CrosswordAdminPage } from './pages/CrosswordAdminPage';
import { WordSearchPage } from './pages/WordSearchPage';
import { WordSearchAdminPage } from './pages/WordSearchAdminPage';
import { SudokuPage } from './pages/SudokuPage';
import { SudokuAdminPage } from './pages/SudokuAdminPage';
import { MazePage } from './pages/MazePage';
import { MazeAdminPage } from './pages/MazeAdminPage';
import { WordSurvivorPage } from './pages/WordSurvivorPage';
import { WordSurvivorAdminPage } from './pages/WordSurvivorAdminPage';
import { SystemAdminPage } from './pages/SystemAdminPage';
import { HostLeaderboardPage } from './pages/HostLeaderboardPage';
import { PlayerLeaderboardPage } from './pages/PlayerLeaderboardPage';
import { PartyThemeProvider } from './components/PartyThemeProvider';

function RequirePlayer({ children }: { children: ReactNode }) {
  const location = useLocation();
  const stored = readStoredSession();
  if (!stored.playerId || !stored.playerName) {
    return <Navigate to={loginRedirect(location.pathname)} replace />;
  }
  return children;
}

export function App() {
  return (
    <PartyThemeProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequirePlayer>
            <MenuPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/quizzer"
        element={
          <RequirePlayer>
            <PlayPage />
          </RequirePlayer>
        }
      />
      <Route path="/play" element={<Navigate to="/quizzer" replace />} />
      <Route
        path="/crossword"
        element={
          <RequirePlayer>
            <CrosswordPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/wordsearch"
        element={
          <RequirePlayer>
            <WordSearchPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/sudoku"
        element={
          <RequirePlayer>
            <SudokuPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/maze"
        element={
          <RequirePlayer>
            <MazePage />
          </RequirePlayer>
        }
      />
      <Route
        path="/wordsurvivor"
        element={
          <RequirePlayer>
            <WordSurvivorPage />
          </RequirePlayer>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <RequirePlayer>
            <PlayerLeaderboardPage />
          </RequirePlayer>
        }
      />
      <Route path="/host" element={<HostMenuPage />} />
      <Route path="/host/leaderboard" element={<HostLeaderboardPage />} />
      <Route path="/host/quizzer" element={<AdminPage />} />
      <Route path="/host/crossword" element={<CrosswordAdminPage />} />
      <Route path="/host/wordsearch" element={<WordSearchAdminPage />} />
      <Route path="/host/sudoku" element={<SudokuAdminPage />} />
      <Route path="/host/maze" element={<MazeAdminPage />} />
      <Route path="/host/wordsurvivor" element={<WordSurvivorAdminPage />} />
      <Route path="/host/system" element={<SystemAdminPage />} />
      <Route path="/host/admin" element={<Navigate to="/host/quizzer" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </PartyThemeProvider>
  );
}

export default App;
