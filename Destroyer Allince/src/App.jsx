import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import GamePage from "./pages/GamePage";
import ProfilePage from "./pages/ProfilePage";
import WarPage from "./pages/WarPage";
import IntroStory from "./pages/IntroStory";
import Login from "./pages/login";
import Register from "./pages/register";

function AppRoutes() {
  const location = useLocation();
  const state = location.state;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/intro"
          element={(
            <ProtectedRoute>
              <IntroStory />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/dashboard"
          element={(
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          )}
        />
        <Route path="/home" element={<Navigate to="/game" replace />} />
        <Route
          path="/game"
          element={(
            <ProtectedRoute>
              <GamePage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/war"
          element={(
            <ProtectedRoute>
              <WarPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile"
          element={(
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path="/profile"
            element={(
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            )}
          />
        </Routes>
      ) : null}
    </>
  );
}

function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}

export default App;
