import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "react/jsx-runtime": fileURLToPath(new URL("./node_modules/react/jsx-runtime.js", import.meta.url)),
      "react/jsx-dev-runtime": fileURLToPath(new URL("./node_modules/react/jsx-dev-runtime.js", import.meta.url)),
      "react-dom/client": fileURLToPath(new URL("./node_modules/react-dom/client.js", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "framer-motion"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
      protocol: "ws",
      clientPort: 5173,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
});
