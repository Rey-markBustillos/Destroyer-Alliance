import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import GamePage from "./pages/GamePage";
import WarPage from "./pages/WarPage";
import Login from "./pages/login";
import Register from "./pages/register";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
