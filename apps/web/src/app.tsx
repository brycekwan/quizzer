import { Navigate, Route, Routes } from 'react-router-dom';
import { PlayPage } from './pages/PlayPage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/play" replace />} />
      <Route path="/play" element={<PlayPage />} />
      <Route path="/host/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/play" replace />} />
    </Routes>
  );
}

export default App;
