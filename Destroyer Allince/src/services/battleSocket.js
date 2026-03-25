import { io } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export const createBattleSocket = (token) =>
  io(SOCKET_BASE_URL, {
    path: "/socket.io",
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
    timeout: 10000,
    auth: {
      token,
    },
  });
