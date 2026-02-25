import { Navigate, Route, Routes } from 'react-router-dom';
import AdminPanel from './pages/AdminPanel';
import UserPanel from './pages/UserPanel';
import NavBar from './components/NavBar';
import PasswordGate from './components/PasswordGate';
import AdminGate from './components/AdminGate';
import { usePassword } from './context/PasswordContext';

const HomeRedirect = () => {
  const { role } = usePassword();

  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (role === 'user') {
    return <Navigate to="/catalog" replace />;
  }

  // role === 'none' durumunda PasswordGate login ekranını gösterecek
  return <Navigate to="/catalog" replace />;
};

const AppContent = () => {
  return (
    <div className="app-container">
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/catalog" element={<UserPanel />} />
          <Route
            path="/admin"
            element={(
              <AdminGate>
                <AdminPanel />
              </AdminGate>
            )}
          />
        </Routes>
      </main>
    </div>
  );
};

const App = () => (
  <PasswordGate>
    <AppContent />
  </PasswordGate>
);

export default App;


