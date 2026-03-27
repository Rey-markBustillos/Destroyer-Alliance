import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchProfile, updateProfileName } from "../services/auth";
import { getGameSnapshot, saveGameSnapshot } from "../services/gameStorage";
import { clearSession, getSession, saveSession } from "../services/session";

const RENAME_COST = 5000;
const EditNameIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5" />
    <path d="M15 6l3 3" />
    <path d="M10 14l8-8 3 3-8 8-4 1 1-4Z" />
  </svg>
);

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(() => getSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renameValue, setRenameValue] = useState(() => getSession()?.name || "");
  const [renameError, setRenameError] = useState("");
  const [renameSuccess, setRenameSuccess] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [showRenameForm, setShowRenameForm] = useState(false);
  const isOverlay = Boolean(location.state?.backgroundLocation);

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
        setRenameValue(mergedSession.name || "");
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
  const playerGold = Number(profile?.gold ?? 0) || 0;
  const canAffordRename = playerGold >= RENAME_COST;

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  const handleClose = () => {
    if (isOverlay) {
      navigate(-1);
      return;
    }

    navigate("/game");
  };

  const handleRenameSubmit = async (event) => {
    event.preventDefault();
    const token = getSession()?.token;
    const nextName = renameValue.trim();

    setRenameError("");
    setRenameSuccess("");

    if (!token) {
      setRenameError("Login session missing.");
      return;
    }

    if (nextName.length < 3) {
      setRenameError("Player name must be at least 3 characters.");
      return;
    }

    if (nextName.length > 24) {
      setRenameError("Player name must be 24 characters or less.");
      return;
    }

    if (nextName === (profile?.name ?? "").trim()) {
      setRenameError("Enter a different player name.");
      return;
    }

    if (!canAffordRename) {
      setRenameError("You need 5000 gold to change your player name.");
      return;
    }

    try {
      setIsRenaming(true);
      const updatedProfile = await updateProfileName(token, nextName);
      const nextSession = {
        ...(getSession() ?? {}),
        ...updatedProfile,
        token,
      };

      saveSession(nextSession);
      setProfile(nextSession);
      setRenameValue(updatedProfile.name || nextName);
      setRenameSuccess(updatedProfile.message || "Player name updated successfully.");
      setShowRenameForm(false);

      const savedSnapshot = getGameSnapshot(nextSession);
      if (savedSnapshot) {
        saveGameSnapshot(
          {
            ...savedSnapshot,
            gold: updatedProfile.gold,
          },
          nextSession
        );
      }
    } catch (requestError) {
      setRenameError(requestError.response?.data?.message || "Unable to update player name.");
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <main
      className={
        isOverlay
          ? "absolute inset-0 z-30 flex items-start justify-center bg-slate-950/12 px-4 py-10 text-white backdrop-blur-[2px]"
          : "min-h-screen px-4 py-10 text-white"
      }
    >
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={`rounded-2xl border border-emerald-500/30 p-6 shadow-2xl ${
            isOverlay ? "bg-slate-900/88" : "bg-slate-900/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">
                Profile
              </p>
              <h1 className="mt-3 text-3xl font-black">Commander Card</h1>
              <p className="mt-2 text-slate-300">
                View your player identity for battles and progression.
              </p>
            </div>
            <div className="flex items-center">
              <img
                src="/assets/goldcoin.png"
                alt="Gold"
                className="h-8 w-8"
              />
              <span className="ml-2 text-xl font-bold text-amber-400">
                {playerGold.toLocaleString()}
              </span>
            </div>
          </div>

          {loading && (
            <p className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              Loading profile...
            </p>
          )}

          {error && (
            <p className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          )}

          <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="relative rounded-xl border border-white/10 bg-slate-950/80 p-4">
                <img
                  src={"/assets/army/front/walk.png"}
                  alt="Player Avatar"
                  className="mx-auto h-48 w-48 rounded-full object-cover"
                />
                <div className="absolute bottom-4 left-4 right-4 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    Level 5
                  </p>
                  <div className="mt-1 h-2 w-full rounded-full bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: "75%" }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <article className="rounded-xl border border-white/10 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Player Name
                </p>
                {showRenameForm ? (
                  <form onSubmit={handleRenameSubmit} className="mt-2 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={24}
                        placeholder="Enter new player name"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-lg font-bold text-emerald-100 outline-none transition focus:border-emerald-400"
                      />
                      <button
                        type="submit"
                        disabled={isRenaming || !canAffordRename}
                        className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Save player name"
                      >
                        {isRenaming ? "..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRenameForm(false);
                          setRenameError("");
                          setRenameValue(playerName);
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                        title="Cancel rename"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <p className="text-slate-400">Change name cost: 5000 gold</p>
                      <p className={canAffordRename ? "text-emerald-300" : "text-rose-300"}>
                        {canAffordRename ? "Enough gold" : "Not enough gold"}
                      </p>
                    </div>
                    {renameError ? (
                      <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {renameError}
                      </p>
                    ) : null}
                    {renameSuccess ? (
                      <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {renameSuccess}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-2xl font-bold text-emerald-200">
                        {playerName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameError("");
                          setRenameSuccess("");
                          setRenameValue(playerName);
                          setShowRenameForm(true);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 transition hover:bg-emerald-500/20"
                        title="Change player name"
                        aria-label="Change player name"
                      >
                        <EditNameIcon />
                      </button>
                    </div>
                    {renameSuccess ? (
                      <p className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {renameSuccess}
                      </p>
                    ) : null}
                  </>
                )}
              </article>

              <article className="mt-4 rounded-xl border border-white/10 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Player ID
                </p>
                <p className="mt-2 break-all text-lg font-bold text-amber-200">
                  {playerId}
                </p>
              </article>

              <section className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Email
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  {profile?.email || "-"}
                </p>
              </section>

            </div>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              {isOverlay ? "Close" : "Back To Game"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
