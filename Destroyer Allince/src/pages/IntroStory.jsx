import { useEffect, useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

import { clearIntroPending, getSession, isIntroPending } from "../services/session";

const STORY_BEATS = [
  {
    kicker: "The Fall Of The World",
    title: "Taong 2095...",
    tone: "from-rose-500/90 via-orange-400/80 to-amber-300/80",
    lines: [
      "Naubos ang resources ng mundo: langis, tubig, at enerhiya.",
      "Nag-agawan ang mga bansa hanggang sumiklab ang digmaang tinawag na The Final Collapse.",
      "Bumagsak ang mga gobyerno, nawasak ang mga siyudad, at nilamon ng kaguluhan ang mundo.",
    ],
  },
  {
    kicker: "The Rise Of Alliances",
    title: "Mula sa abo ng sibilisasyon...",
    tone: "from-amber-400/90 via-yellow-300/80 to-lime-300/75",
    lines: [
      "Lumitaw ang mga survivors, dating militar, at mga strategist na tumangging sumuko.",
      "Nagbuo sila ng makapangyarihang paksyon na tinawag na Alliances.",
      "Bawat alliance ay may sariling base, hukbo, at laban para sa resources at kontrol.",
    ],
  },
  {
    kicker: "You Are The Commander",
    title: "Ikaw ang piniling mamuno.",
    tone: "from-sky-500/90 via-cyan-400/80 to-emerald-300/75",
    lines: [
      "Hindi ka ordinaryong survivor. Ikaw ang bagong commander ng isang elite war faction.",
      "Bawat desisyon mo ang magtatakda kung mabubuhay ang alliance mo o mawawala sa mapa.",
      "Ang iyong pangalan ay magiging simbolo ng takot o pag-asa sa bagong mundong ito.",
    ],
  },
  {
    kicker: "Destroyer Alliance",
    title: "Your war begins now.",
    tone: "from-fuchsia-500/90 via-rose-500/85 to-orange-300/80",
    lines: [
      "Pinamumunuan mo ngayon ang DESTROYER ALLIANCE.",
      "Layunin mo: ibalik ang kapangyarihan, sakupin ang natitirang teritoryo, at wasakin ang lahat ng kalaban.",
      "Magtayo ng base. Mag-ipon ng hukbo. Simulan ang pananakop.",
    ],
  },
];

export default function IntroStory() {
  const navigate = useNavigate();
  const location = useLocation();
  const [storyIndex, setStoryIndex] = useState(0);
  const session = getSession();
  const activeBeat = STORY_BEATS[storyIndex];
  const canViewIntro = Boolean(session) && (location.state?.justRegistered || isIntroPending());

  useEffect(() => {
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    if (!canViewIntro) {
      navigate("/game", { replace: true });
    }
  }, [canViewIntro, navigate, session]);

  const commanderName = useMemo(
    () => session?.name || session?.user?.name || "Commander",
    [session]
  );

  const finishIntro = () => {
    clearIntroPending();
    navigate("/game", { replace: true });
  };

  if (!canViewIntro) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.14),transparent_28%),linear-gradient(145deg,rgba(2,6,23,0.96)_0%,rgba(15,23,42,0.92)_42%,rgba(2,6,23,1)_100%)]" />
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "110px 110px" }} />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="grid w-full max-w-6xl gap-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_30px_100px_rgba(2,6,23,0.5)] backdrop-blur-2xl lg:grid-cols-[0.92fr_1.08fr] lg:p-6">
          <Motion.div
            key={`narrator-${storyIndex}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className="relative flex min-h-[20rem] items-end overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(2,6,23,0.98)_100%)]"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${activeBeat.tone} opacity-35`} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_36%)]" />
            <img
              src="/assets/narrator.png"
              alt="Narrator"
              className="relative z-10 mx-auto h-[25rem] w-full max-w-md object-contain object-bottom"
            />
            <div className="absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(180deg,transparent_0%,rgba(2,6,23,0.22)_18%,rgba(2,6,23,0.95)_100%)] px-5 pb-5 pt-12">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-amber-300/80">Narrator Transmission</p>
              <p className="mt-2 text-xl font-black text-white">Hello, welcome Commander {commanderName}.</p>
              <p className="mt-1 text-sm text-slate-300">The last war on Earth is about to begin.</p>
            </div>
          </Motion.div>

          <Motion.div
            key={`story-${storyIndex}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="flex min-h-[20rem] flex-col justify-between rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.74)_0%,rgba(2,6,23,0.88)_100%)] p-5 lg:p-7"
          >
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">{activeBeat.kicker}</p>
                <p className="text-[0.72rem] font-semibold text-slate-400">{storyIndex + 1}/{STORY_BEATS.length}</p>
              </div>
              <h1 className="mt-3 text-3xl font-black leading-tight text-white lg:text-4xl">{activeBeat.title}</h1>
              <div className="mt-5 space-y-3 text-sm leading-7 text-slate-200 lg:text-base">
                {activeBeat.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${activeBeat.tone} transition-all duration-300`}
                  style={{ width: `${((storyIndex + 1) / STORY_BEATS.length) * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={finishIntro}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/10"
                >
                  Skip Story
                </button>
                {storyIndex < STORY_BEATS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStoryIndex((current) => Math.min(current + 1, STORY_BEATS.length - 1))}
                    className="rounded-2xl bg-[linear-gradient(120deg,#f97316_0%,#fb7185_52%,#f59e0b_100%)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:brightness-110"
                  >
                    Next Transmission
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={finishIntro}
                    className="rounded-2xl bg-[linear-gradient(120deg,#22c55e_0%,#38bdf8_100%)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:brightness-110"
                  >
                    Enter The Base
                  </button>
                )}
              </div>
            </div>
          </Motion.div>
        </div>
      </div>
    </div>
  );
}
