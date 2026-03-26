import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchProfile } from "../services/auth";
import { getSession, saveSession } from "../services/session";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => getSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentSession = getSession();
    const token = currentSession?.token;

    if (!token) {
      setLoading(false);
      return;
    }

    let isActive = true;

    const loadProfile = async () => {
      try {
        const remoteProfile = await fetchProfile(token);

        if (!isActive) {
          return;
        }

        const mergedSession = {
          ...currentSession,
          ...remoteProfile,
          token,
        };

        saveSession(mergedSession);
        setProfile(mergedSession);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setError(requestError.response?.data?.message || "Unable to load profile.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  const playerId = useMemo(() => {
    if (profile?.playerId) {
      return profile.playerId;
    }

    if (Number.isFinite(Number(profile?.id))) {
      return `PLYR-${String(profile.id).padStart(6, "0")}`;
    }

    return "-";
  }, [profile]);

  const playerName = profile?.name || profile?.email?.split("@")[0] || "Commander";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-6 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Profile</p>
          <h1 className="mt-3 text-3xl font-black">Commander Card</h1>
          <p className="mt-2 text-slate-300">View your player identity for battles and progression.</p>

          {loading ? (
            <p className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Loading profile...
            </p>
          ) : null}

          {error ? (
            <p className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Player Name</p>
              <p className="mt-2 text-2xl font-bold text-emerald-200">{playerName}</p>
            </article>

            <article className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Player ID</p>
              <p className="mt-2 break-all text-lg font-bold text-amber-200">{playerId}</p>
            </article>
          </section>

          <section className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Email</p>
            <p className="mt-1 text-sm text-slate-200">{profile?.email || "-"}</p>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/game")}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Back To Game
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
