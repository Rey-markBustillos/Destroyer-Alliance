import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion as Motion } from "framer-motion";

import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { primeAuthLoadingScreen } from "../components/authLoadingScreenUtils";
import PwaInstallButton from "../components/PwaInstallButton";
import { login } from "../services/auth";
import { markWelcomeBackPending, saveSession } from "../services/session";
import { primeGameRoute } from "../utils/routePreload";

const cinematicEase = [0.22, 1, 0.36, 1];

const backgroundVariants = {
  idle: {
    scale: 1,
    x: "0%",
  },
  loggingIn: {
    scale: [1, 1.05, 1.01, 1],
    x: ["0%", "-5%", "1.5%", "0%"],
    transition: {
      duration: 3,
      ease: "easeInOut",
      times: [0, 0.35, 0.7, 1],
    },
  },
};

const foregroundVariants = {
  idle: {
    scale: 1.02,
    x: "0%",
  },
  loggingIn: {
    scale: [1.02, 1.08, 1.04, 1.02],
    x: ["0%", "-8%", "3%", "0%"],
    transition: {
      duration: 3,
      ease: "easeInOut",
      times: [0, 0.35, 0.72, 1],
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 50,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.9,
      ease: cinematicEase,
    },
  },
};

const contentVariants = {
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.35,
      ease: cinematicEase,
    },
  },
  hidden: {
    opacity: 0,
    y: 12,
    filter: "blur(4px)",
    transition: {
      duration: 0.35,
      ease: "easeInOut",
    },
  },
};

const floatingLabelClass = (active) =>
  `pointer-events-none absolute left-4 transition-all duration-300 ${
    active
      ? "top-2 text-[10px] uppercase tracking-[0.22em] text-sky-300"
      : "top-1/2 -translate-y-1/2 text-sm text-slate-400"
  }`;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [focusedField, setFocusedField] = useState("");

  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        id: index,
        size: 4 + (index % 4) * 3,
        left: 6 + ((index * 11) % 88),
        top: 8 + ((index * 7) % 80),
        duration: 5 + (index % 5),
        delay: (index % 6) * 0.45,
      })),
    []
  );

  useEffect(() => {
    primeAuthLoadingScreen("/assets/loginbackgound.png");
    primeGameRoute();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setIsLoggingIn(true);

    try {
      const session = await login({ email, password });
      saveSession(session);
      markWelcomeBackPending();
      setTimeout(() => {
        navigate("/game");
      }, 1900);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Login failed.");
      setLoading(false);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="app-screen-height relative overflow-hidden bg-slate-950 text-white">
      <Motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/assets/loginbackgound.png')" }}
        variants={backgroundVariants}
        initial="idle"
        animate={isLoggingIn ? "loggingIn" : "idle"}
      />

      <Motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat mix-blend-screen opacity-20"
        style={{ backgroundImage: "url('/assets/loginbackgound.png')" }}
        variants={foregroundVariants}
        initial="idle"
        animate={isLoggingIn ? "loggingIn" : "idle"}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_28%),linear-gradient(135deg,rgba(2,6,23,0.24)_0%,rgba(2,6,23,0.58)_45%,rgba(2,6,23,0.86)_100%)]" />

      <Motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity: isLoggingIn ? 1 : 0.8,
          backdropFilter: isLoggingIn ? "blur(8px)" : "blur(2px)",
        }}
        transition={{ duration: 0.75, ease: cinematicEase }}
      >
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.58)_46%,rgba(2,6,23,0.84)_100%)]" />
      </Motion.div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
        }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((particle) => (
          <Motion.span
            key={particle.id}
            className="absolute rounded-full bg-sky-300/40 shadow-[0_0_18px_rgba(125,211,252,0.35)]"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
            }}
            animate={{
              y: [0, -18, 0],
              opacity: [0.15, 0.55, 0.15],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <div className="mobile-landscape-auth-shell relative z-10 flex items-center justify-center overflow-y-auto px-4 py-4">
        <Motion.div
          className="mobile-landscape-auth-wrap w-full max-w-md"
          initial="hidden"
          animate="visible"
          variants={cardVariants}
        >
          <Motion.form
            onSubmit={handleSubmit}
            className="mobile-landscape-auth-card relative overflow-hidden rounded-[1.45rem] border border-white/15 bg-white/10 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl min-[901px]:rounded-[1.8rem] min-[901px]:p-7"
            initial={false}
            animate="visible"
            variants={cardVariants}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.06)_30%,rgba(15,23,42,0.16)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.24),transparent_70%)]" />

            <Motion.div
              variants={contentVariants}
              initial="visible"
              animate="visible"
              className="relative z-10"
            >
              <div className="mobile-landscape-auth-content">
                <Motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: cinematicEase }}
                  className="mobile-landscape-auth-hero"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-400/10 shadow-[0_0_30px_rgba(56,189,248,0.16)] min-[901px]:h-14 min-[901px]:w-14">
                    <Motion.span
                      className="text-lg min-[901px]:text-xl"
                      animate={{ rotate: [0, 8, -6, 0], scale: [1, 1.04, 1] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      C
                    </Motion.span>
                  </div>
                  <p className="mt-4 text-center text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-sky-300/80 min-[901px]:mt-5 min-[901px]:text-[0.72rem] min-[901px]:tracking-[0.4em]">
                    Secure Access
                  </p>
                  <h1 className="mt-2 text-center text-2xl font-black tracking-tight min-[901px]:mt-3 min-[901px]:text-3xl md:text-[2.25rem]">
                    Destroyer Alliance
                  </h1>
                  <p className="mt-2 text-center text-xs leading-5 text-slate-300 min-[901px]:mt-3 min-[901px]:text-sm min-[901px]:leading-6">
                    Command your base with a smoother, more cinematic sign-in experience.
                  </p>
                </Motion.div>

                <div className="mt-5 min-[901px]:mt-0">
                  <div className="space-y-3 min-[901px]:space-y-4">
                    <Motion.div
                      animate={{
                        scale: focusedField === "email" || email ? 1.01 : 1,
                      }}
                      transition={{ duration: 0.2 }}
                      className="relative"
                    >
                      <label className={floatingLabelClass(focusedField === "email" || Boolean(email))}>
                        Email
                      </label>
                      <Motion.input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => setFocusedField((current) => (current === "email" ? "" : current))}
                        disabled={loading}
                        required
                        whileFocus={{
                          boxShadow: "0 0 0 1px rgba(96,165,250,0.85), 0 0 28px rgba(59,130,246,0.26)",
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/72 px-4 pb-3 pt-6 text-sm text-white outline-none transition placeholder:text-transparent"
                        placeholder="Email"
                      />
                    </Motion.div>

                    <Motion.div
                      animate={{
                        scale: focusedField === "password" || password ? 1.01 : 1,
                      }}
                      transition={{ duration: 0.2 }}
                      className="relative"
                    >
                      <label className={floatingLabelClass(focusedField === "password" || Boolean(password))}>
                        Password
                      </label>
                      <Motion.input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField((current) => (current === "password" ? "" : current))}
                        disabled={loading}
                        required
                        whileFocus={{
                          boxShadow: "0 0 0 1px rgba(167,139,250,0.85), 0 0 28px rgba(139,92,246,0.24)",
                        }}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/72 px-4 pb-3 pt-6 text-sm text-white outline-none transition placeholder:text-transparent"
                        placeholder="Password"
                      />
                    </Motion.div>
                  </div>

                  <AnimatePresence>
                    {error ? (
                      <Motion.p
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                      >
                        {error}
                      </Motion.p>
                    ) : null}
                  </AnimatePresence>

                  <Motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{
                      scale: 1.05,
                      boxShadow: "0 16px 36px rgba(37,99,235,0.38)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-5 w-full cursor-pointer rounded-2xl bg-[linear-gradient(120deg,#2563eb_0%,#3b82f6_35%,#60a5fa_60%,#2563eb_100%)] bg-size-[200%_100%] px-4 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)] transition disabled:cursor-not-allowed disabled:opacity-70 min-[901px]:mt-6"
                  >
                    <Motion.span
                      className="block"
                      animate={{ backgroundPositionX: ["0%", "100%"] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                    >
                      Login
                    </Motion.span>
                  </Motion.button>

                  <div className="relative mt-3 flex justify-center">
                    <PwaInstallButton className="min-h-11 rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-100 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-400/18" />
                  </div>

                  <p className="mt-4 text-center text-sm text-slate-300 min-[901px]:mt-5">
                    Don&apos;t have an account?{" "}
                    <Link to="/register" className="font-semibold text-sky-300 transition hover:text-sky-200 hover:underline">
                      Register
                    </Link>
                  </p>
                </div>
              </div>
            </Motion.div>
          </Motion.form>
        </Motion.div>
      </div>

      <AnimatePresence>
        {isLoggingIn ? (
          <AuthLoadingScreen
            title="Loading......."
            description="Opening your command interface and preparing the battlefield."
            imageSrc="/assets/loginbackgound.png"
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
