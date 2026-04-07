import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthLoadingScreen from "./components/AuthLoadingScreen";
import {
  loadDashboardPage,
  loadGamePage,
  loadIntroStoryPage,
  loadLoginPage,
  loadProfilePage,
  loadRegisterPage,
  loadWarPage,
} from "./utils/routePreload";
import { useVisualEffectsProfile } from "./utils/visualEffects";

const Dashboard = lazy(loadDashboardPage);
const GamePage = lazy(loadGamePage);
const ProfilePage = lazy(loadProfilePage);
const WarPage = lazy(loadWarPage);
const IntroStory = lazy(loadIntroStoryPage);
const Login = lazy(loadLoginPage);
const Register = lazy(loadRegisterPage);

function RouteLoadingFallback() {
  return (
    <AuthLoadingScreen
      title="Loading Route..."
      description="Preparing the next screen and loading only the assets needed for this view."
    />
  );
}

function AppRoutes() {
  const location = useLocation();
  const state = location.state;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
    </Suspense>
  );
}

function App() {
  const visualEffectsProfile = useVisualEffectsProfile();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.effectsMode = visualEffectsProfile.reduceEffects ? "reduced" : "full";

    return () => {
      delete root.dataset.effectsMode;
    };
  }, [visualEffectsProfile.reduceEffects]);

  return (
    <MotionConfig reducedMotion={visualEffectsProfile.reduceMotion ? "always" : "never"}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </MotionConfig>
  );
}

export default App;
