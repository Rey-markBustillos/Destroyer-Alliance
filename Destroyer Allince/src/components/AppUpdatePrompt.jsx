import { useEffect, useState } from "react";

import {
  reloadToLatestAppVersion,
  subscribeToAppUpdates,
} from "../services/appUpdate";

export default function AppUpdatePrompt({ enabled = true }) {
  const [updateState, setUpdateState] = useState({
    currentBuildId: "",
    latestBuildId: "",
    isUpdateAvailable: false,
    hasWaitingWorker: false,
  });
  const [dismissedBuildId, setDismissedBuildId] = useState("");

  useEffect(() => subscribeToAppUpdates(setUpdateState), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (dismissedBuildId && dismissedBuildId !== updateState.latestBuildId) {
      setDismissedBuildId("");
    }
  }, [dismissedBuildId, enabled, updateState.latestBuildId]);

  if (!enabled || !updateState.isUpdateAvailable || dismissedBuildId === updateState.latestBuildId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/72 px-3 py-3 min-[520px]:items-center min-[901px]:px-4 min-[901px]:py-4">
      <div className="mobile-landscape-update-modal mobile-safe-solid-panel flex w-full max-w-[min(94vw,31rem)] flex-col rounded-[1.25rem] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.9)_100%)] p-4 text-white shadow-[0_24px_70px_rgba(2,6,23,0.45)] min-[901px]:rounded-[1.5rem] min-[901px]:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-cyan-300/75 min-[901px]:text-[0.72rem]">
              New Update Ready
            </p>
            <h2 className="mt-1 text-lg font-black leading-tight min-[901px]:text-2xl">
              Reload to get the latest version
            </h2>
          </div>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/12 text-cyan-200 min-[901px]:h-12 min-[901px]:w-12">
            <span className="text-lg font-black min-[901px]:text-xl">R</span>
          </div>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-300 min-[901px]:mt-4 min-[901px]:text-[15px]">
          May bagong update na ang Destroyer Alliance. I-reload mo na para makita agad ang latest fixes, UI updates, at bagong assets.
        </p>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-5 text-slate-300 min-[901px]:mt-4 min-[901px]:px-3.5 min-[901px]:py-2.5 min-[901px]:text-xs">
          {updateState.hasWaitingWorker
            ? "Ready na rin ang updated app shell. One tap reload lang para lumipat sa bagong build."
            : "Na-detect ang mas bagong build sa server. Reload mo lang para pumasok agad ang update."}
        </div>

        <div className="mobile-landscape-update-actions mt-4 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 min-[901px]:mt-5 min-[901px]:gap-3">
          <button
            type="button"
            onClick={() => setDismissedBuildId(updateState.latestBuildId)}
            className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10 min-[901px]:py-3.5"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => reloadToLatestAppVersion()}
            className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,#22d3ee_0%,#0891b2_100%)] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition hover:brightness-105 min-[901px]:py-3.5"
          >
            Reload Now
          </button>
        </div>
      </div>
    </div>
  );
}
