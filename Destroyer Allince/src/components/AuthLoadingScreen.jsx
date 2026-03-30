import { useEffect, useState } from "react";

const LOADING_SCREEN_SRC = "/assets/LOADINGSCREEN/LOAD1.png";

export const primeAuthLoadingScreen = () => {
  if (typeof window === "undefined") {
    return;
  }

  const image = new window.Image();
  image.decoding = "async";
  image.src = LOADING_SCREEN_SRC;
};

const getConnectionState = () => {
  if (typeof navigator === "undefined") {
    return {
      effectiveType: "",
      saveData: false,
      slowConnection: false,
    };
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType ?? "");
  const saveData = Boolean(connection?.saveData);
  const slowConnection = saveData || effectiveType === "slow-2g" || effectiveType === "2g";

  return {
    effectiveType,
    saveData,
    slowConnection,
  };
};

export default function AuthLoadingScreen({
  title = "Loading.......",
  description = "Securing your session and preparing the battlefield.",
}) {
  const [connectionState, setConnectionState] = useState(() => getConnectionState());

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (!connection?.addEventListener) {
      return undefined;
    }

    const handleChange = () => {
      setConnectionState(getConnectionState());
    };

    connection.addEventListener("change", handleChange);
    return () => {
      connection.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-950 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${LOADING_SCREEN_SRC}')` }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat mix-blend-screen opacity-20"
        style={{ backgroundImage: `url('${LOADING_SCREEN_SRC}')` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_28%),linear-gradient(135deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.48)_45%,rgba(2,6,23,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.56)_46%,rgba(2,6,23,0.82)_100%)]" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-end px-5 py-6 sm:px-8 sm:py-8">
        <div className="max-w-[28rem] rounded-[1.6rem] border border-white/12 bg-slate-950/40 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.36)] backdrop-blur-md sm:p-6">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.32em] text-sky-300/85">
            Loading
          </p>
          <h3 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-200/92 sm:text-base">
            {description}
          </p>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/12">
            <div className="h-full w-2/3 rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#60a5fa_45%,#f8fafc_100%)] animate-pulse" />
          </div>

          <p className="mt-3 text-xs text-slate-300/90 sm:text-sm">
            {connectionState.slowConnection
              ? "Slow signal detected. Using local assets first for a faster login screen."
              : "Using local loading assets for a smoother sign-in."}
          </p>
        </div>
      </div>
    </div>
  );
}
