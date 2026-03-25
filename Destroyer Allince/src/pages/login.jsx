import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/auth";
import { saveSession } from "../services/session";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const session = await login({ email, password });
      saveSession(session);
      navigate("/game");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-950/70 bg-cover bg-center bg-no-repeat px-4"
      style={{ backgroundImage: "url('/assets/loginbackgound.png')" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6"
      >
        <h2 className="mb-5 text-center text-2xl font-bold text-white md:text-3xl">
          Destroyer Alliance
        </h2>

        <p className="mb-5 text-center text-xs text-slate-200 md:text-sm">
          Login to continue your battle
        </p>

        <div className="mb-3">
          <label className="text-xs text-slate-100">Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-100">Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mx-auto block rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-lg transition duration-300 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="mt-5 text-center text-xs text-slate-200">
          Don't have an account?{" "}
          <Link to="/register" className="text-blue-300 hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
