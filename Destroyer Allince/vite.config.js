import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const createVersionPayload = (buildId) => JSON.stringify({
  buildId,
  generatedAt: buildId,
}, null, 2);

const appVersionPlugin = (buildId) => ({
  name: "destroyer-alliance-app-version",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const requestPath = req.url?.split("?")[0];

      if (requestPath !== "/version.json") {
        next();
        return;
      }

      const payload = createVersionPayload(buildId);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.end(payload);
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: createVersionPayload(buildId),
    });
  },
});

// https://vite.dev/config/
export default defineConfig(() => {
  const buildId = new Date().toISOString();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      appVersionPlugin(buildId),
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
  };
});
