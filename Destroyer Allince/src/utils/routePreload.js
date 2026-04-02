export const loadDashboardPage = () => import("../pages/Dashboard");
export const loadGamePage = () => import("../pages/GamePage");
export const loadProfilePage = () => import("../pages/ProfilePage");
export const loadWarPage = () => import("../pages/WarPage");
export const loadIntroStoryPage = () => import("../pages/IntroStory");
export const loadLoginPage = () => import("../pages/login");
export const loadRegisterPage = () => import("../pages/register");

export const primeGameRoute = () => loadGamePage();
export const primeWarRoute = () => loadWarPage();
export const primeIntroRoute = () => loadIntroStoryPage();
