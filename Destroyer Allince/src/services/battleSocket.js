import { io } from "socket.io-client";

import { SOCKET_BASE_URL } from "./apiConfig";

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
