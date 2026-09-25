import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { PlayPage } from './pages/PlayPage';
import { AdminPage } from './pages/AdminPage';
import { HostMenuPage } from './pages/HostMenuPage';
import { CrosswordPage } from './pages/CrosswordPage';
import { CrosswordAdminPage } from './pages/CrosswordAdminPage';
import { WordSearchPage } from './pages/WordSearchPage';
import { WordSearchAdminPage } from './pages/WordSearchAdminPage';
import { SystemAdminPage } from './pages/SystemAdminPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<MenuPage />} />
      <Route path="/quizzer" element={<PlayPage />} />
      <Route path="/play" element={<Navigate to="/quizzer" replace />} />
      <Route path="/crossword" element={<CrosswordPage />} />
      <Route path="/wordsearch" element={<WordSearchPage />} />
      <Route path="/host" element={<HostMenuPage />} />
      <Route path="/host/quizzer" element={<AdminPage />} />
      <Route path="/host/crossword" element={<CrosswordAdminPage />} />
      <Route path="/host/wordsearch" element={<WordSearchAdminPage />} />
      <Route path="/host/system" element={<SystemAdminPage />} />
      <Route path="/host/admin" element={<Navigate to="/host/quizzer" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
