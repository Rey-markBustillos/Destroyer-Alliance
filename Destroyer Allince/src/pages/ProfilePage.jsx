import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchProfile, updateProfileName } from "../services/auth";
import { getGameSnapshot, saveGameSnapshot } from "../services/gameStorage";
import { clearSession, getSession, saveSession } from "../services/session";

const RENAME_COST = 5000;
const RANK_TIERS = [
  { name: "Recruit", points: 0, description: "Starting player" },
  { name: "Soldier", points: 100, description: "Basic combat ready" },
  { name: "Sergeant", points: 300, description: "Trained fighter" },
  { name: "Lieutenant", points: 700, description: "Tactical leader" },
  { name: "Captain", points: 1500, description: "Strong commander" },
  { name: "Major", points: 3000, description: "Advanced strategist" },
  { name: "Colonel", points: 6000, description: "Elite officer" },
  { name: "General", points: 10000, description: "High command" },
  { name: "Destroyer Commander", points: 15000, description: "Legendary status" },
  { name: "Supreme Destroyer", points: 25000, description: "Top 1% player" },
];
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
  const [showRankList, setShowRankList] = useState(false);
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
  const warPoints = Number(profile?.warPoints ?? 0) || 0;
  const rankName = profile?.rankName || "Recruit";
  const rankDescription = profile?.rankDescription || "Starting player";
  const nextRankName = profile?.nextRankName || rankName;
  const nextRankPoints = Number(profile?.nextRankPoints ?? warPoints) || warPoints;
  const rankProgressPercent = nextRankPoints > warPoints
    ? Math.max(0, Math.min(100, (warPoints / nextRankPoints) * 100))
    : 100;
  const rankProgressLabel = `${Math.round(rankProgressPercent)}%`;
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
          ? "absolute inset-0 z-30 flex items-center justify-center bg-slate-950/12 px-2 py-2 text-white backdrop-blur-[2px]"
          : "min-h-screen px-2 py-2 text-white"
      }
    >
      <div className="mx-auto w-full max-w-[46rem]">
        <div
          className={`rounded-xl border border-emerald-500/30 p-2 shadow-2xl ${
            isOverlay ? "bg-slate-900/88" : "bg-slate-900/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.22em] text-emerald-300/80">
                Profile
              </p>
              <h1 className="mt-0.5 text-base font-black">Commander Card</h1>
              <p className="mt-0.5 text-[10px] text-slate-300">
                View your player identity for battles and progression.
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-amber-300/15 bg-amber-400/5 px-1.5 py-0.5">
              <img
                src="/assets/goldcoin.png"
                alt="Gold"
                className="h-4 w-4"
              />
              <span className="ml-1 text-[12px] font-bold text-amber-400">
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

          <section className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[7.25rem_1fr]">
            <div className="md:col-span-1">
              <div className="relative rounded-lg border border-white/10 bg-slate-950/80 p-1.5">
                <img
                  src={"/assets/army/front/walk.png"}
                  alt="Player Avatar"
                  className="mx-auto h-16 w-16 rounded-full object-cover"
                />
                <div className="absolute bottom-2 left-2 right-2 text-center">
                  <p className="text-[9px] uppercase tracking-[0.16em] text-slate-400">
                    {rankName}
                  </p>
                  <div className="relative mt-1 h-3 overflow-hidden rounded-full border border-emerald-400/20 bg-slate-800/90">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#4ade80_100%)]"
                      style={{ width: `${rankProgressPercent}%` }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[7px] font-black text-white">
                      {rankProgressLabel}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <article className="rounded-xl border border-white/10 bg-slate-950/80 p-2.5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Player Name
                </p>
                {showRenameForm ? (
                  <form onSubmit={handleRenameSubmit} className="mt-1.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        maxLength={24}
                        placeholder="Enter new player name"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-sm font-bold text-emerald-100 outline-none transition focus:border-emerald-400"
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
                    <div className="mt-1.5 flex items-center gap-2">
                      <p className="text-lg font-bold text-emerald-200">
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

              <div className="relative mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowRankList((current) => !current)}
                  className="rounded-xl border border-white/10 bg-slate-950/80 p-2.5 text-left transition hover:border-amber-300/30 hover:bg-slate-900/90"
                >
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    Rank
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-200">
                    {rankName}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    {rankDescription}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-400">
                    War Points
                  </p>
                  <p className="mt-1 text-sm font-bold text-amber-200">
                    {warPoints.toLocaleString()} WP
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    Next: {nextRankName} at {nextRankPoints.toLocaleString()} WP
                  </p>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-300">
                      <span>Progress</span>
                      <span>{warPoints.toLocaleString()}/{nextRankPoints.toLocaleString()}</span>
                    </div>
                    <div className="relative h-4 overflow-hidden rounded-full border border-amber-400/20 bg-slate-900/90">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b_0%,#facc15_100%)]"
                        style={{ width: `${rankProgressPercent}%` }}
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-950">
                        {rankProgressLabel}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                    {showRankList ? "Hide Rank List" : "Tap to view rank list"}
                  </p>
                </button>

                <div className="grid gap-3">
                  <article className="rounded-xl border border-white/10 bg-slate-950/80 p-2.5">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Player ID
                    </p>
                    <p className="mt-1 break-all text-sm font-bold text-amber-200">
                      {playerId}
                    </p>
                  </article>

                  <section className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Email
                    </p>
                    <p className="mt-1 text-[11px] text-slate-200">
                      {profile?.email || "-"}
                    </p>
                  </section>
                </div>
                {showRankList ? (
                  <section className="absolute inset-x-0 top-0 z-20 rounded-xl border border-amber-400/20 bg-slate-950/95 p-2 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-amber-300">Rank List</p>
                      <button
                        type="button"
                        onClick={() => setShowRankList(false)}
                        className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {RANK_TIERS.map((tier) => {
                        const isCurrentRank = tier.name === rankName;

                        return (
                          <div
                            key={tier.name}
                            className={`rounded-lg border px-2 py-1.5 ${
                              isCurrentRank
                                ? "border-amber-300/40 bg-amber-400/10"
                                : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-[11px] font-bold ${isCurrentRank ? "text-amber-200" : "text-white"}`}>
                                {tier.name}
                              </p>
                              <p className="text-[10px] font-semibold text-emerald-300">
                                {tier.points.toLocaleString()} WP
                              </p>
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-300">{tier.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>

            </div>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              {isOverlay ? "Close" : "Back To Game"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Open Dashboard
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
