import { Link, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../services/session";

export default function Navbar() {
  const navigate = useNavigate();
  const session = getSession();

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  return (
    <header className="border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-350 items-center justify-between px-4 py-4 text-white sm:px-6 lg:px-8">
        <Link to={session ? "/game" : "/"} className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-sm font-black tracking-[0.3em] text-emerald-300">
            DA
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.35em] text-slate-400">
              Command Grid
            </p>
            <h1 className="text-base font-semibold text-slate-100 sm:text-lg">
              Destroyer Alliance
            </h1>
          </div>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-full border border-white/10 px-4 py-2 text-slate-300 transition hover:border-emerald-400/40 hover:text-white"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-full bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/"
                className="rounded-full border border-white/10 px-4 py-2 text-slate-300 transition hover:border-emerald-400/40 hover:text-white"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
