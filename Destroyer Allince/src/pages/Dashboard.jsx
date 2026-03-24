import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <main className="min-h-[calc(100vh-72px)] bg-gray-950 text-white px-6 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="text-3xl font-bold">Command Dashboard</h2>
        <p className="text-gray-300">
          Welcome to Destroyer Alliance. Launch the Phaser battlefield or continue
          building your city.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h3 className="text-lg font-semibold">Play Game</h3>
            <p className="text-sm text-gray-400 mt-2">
              Open the RTS canvas and test movement, enemies, and structures.
            </p>
            <Link
              to="/game"
              className="inline-block mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
            >
              Open Game
            </Link>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
            <h3 className="text-lg font-semibold">Account</h3>
            <p className="text-sm text-gray-400 mt-2">
              Manage login and registration flow while backend auth is connected.
            </p>
            <Link
              to="/register"
              className="inline-block mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500"
            >
              Register New User
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
