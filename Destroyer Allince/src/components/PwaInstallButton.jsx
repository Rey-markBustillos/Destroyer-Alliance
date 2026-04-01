import { useEffect, useState } from "react";
import { promptForPwaInstall, subscribeToPwaInstall } from "../services/pwaInstall";

export default function PwaInstallButton({ className = "" }) {
  const [installState, setInstallState] = useState({
    canPromptInstall: false,
    isIos: false,
    isInstalled: false,
  });
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    return subscribeToPwaInstall((snapshot) => {
      setInstallState(snapshot);

      if (snapshot.isInstalled) {
        setShowIosGuide(false);
      }
    });
  }, []);

  const shouldShowButton = !installState.isInstalled && (installState.canPromptInstall || installState.isIos);

  const handleInstallClick = async () => {
    if (installState.canPromptInstall) {
      const prompted = await promptForPwaInstall();

      if (prompted) {
        return;
      }
    }

    if (installState.isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      {shouldShowButton ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={className}
        >
          Install
        </button>
      ) : null}

      {showIosGuide ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-slate-950/94 p-3 text-left text-white shadow-[0_14px_36px_rgba(2,6,23,0.35)] backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                Install On iPhone
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                Buksan ang Safari, tap ang Share icon, tapos piliin ang Add to Home Screen.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-200 transition hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
