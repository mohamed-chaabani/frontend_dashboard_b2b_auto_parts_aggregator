import { Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import ClientProfilePage from './pages/ClientProfilePage';
import { getToken } from './lib/auth';

const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/client/:id"
          element={
            <RequireAuth>
              <ClientProfilePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
