import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../services/auth";
import { saveSession } from "../services/session";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const session = await register({ name, email, password });
      saveSession(session);
      navigate("/game");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Registration failed.");
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
        className="w-full max-w-md rounded-2xl border border-white/20 bg-black/18 p-8 shadow-2xl backdrop-blur-sm"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-6">
          Create Account
        </h2>

        <p className="text-slate-200 text-center mb-6 text-sm md:text-base">
          Join Destroyer Alliance
        </p>

        <div className="mb-4">
          <label className="text-slate-100 text-sm">Commander Name</label>
          <input
            type="text"
            placeholder="Enter your commander name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400"
            required
          />
        </div>

        <div className="mb-4">
          <label className="text-slate-100 text-sm">Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400"
            required
          />
        </div>

        <div className="mb-4">
          <label className="text-slate-100 text-sm">Password</label>
          <input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400"
            required
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
          className="mx-auto block rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition duration-300 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Creating account..." : "Register"}
        </button>

        <p className="text-center text-slate-200 text-sm mt-6">
          Already have an account?{" "}
          <Link to="/" className="text-green-300 hover:underline">
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
