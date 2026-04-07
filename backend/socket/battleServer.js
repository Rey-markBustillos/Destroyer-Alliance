import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import prisma from "../prismaClient.js";

const GRID_ROWS = 12;
const GRID_COLS = 12;
const DEPLOY_START_ROW = GRID_ROWS - 2;
const SOLDIER_SPEED_PER_TICK = 0.18;
const SOLDIER_FIRE_RANGE = 0.42;
const SOLDIER_DAMAGE_PER_TICK = 8;
const BATTLE_TICK_MS = 220;

const BUILDING_WAR_CONFIG = {
  "town-hall": {
    image: "/assets/town.png",
    name: "Town Hall",
    health: 220,
  },
  "wood-machine": {
    image: "/assets/machine-wood.png",
    name: "Wood Machine",
    health: 110,
  },
  "command-center": {
    image: "/assets/command center.png",
    name: "Command Center",
    health: 160,
  },
  skyport: {
    image: "/assets/chopper/skychop.png",
    name: "Chopper Bay",
    health: 180,
  },
};

const matchmakingQueue = [];
const battleRooms = new Map();
const playerRoomMap = new Map();
const onlineUsers = new Map();
const globalChatMessages = [];
const MAX_GLOBAL_CHAT_MESSAGES = 60;
const GLOBAL_CHAT_ROOM = "global-chat";
const globalMarketListings = [];
const MAX_GLOBAL_MARKET_LISTINGS = 80;
const GLOBAL_MARKET_ROOM = "global-market";
const MARKET_ITEM_LABELS = {
  energy: "Energy",
  tank: "Tank",
  helicopter: "Helicopter",
  army: "Army",
};

const getDistance = (aX, aY, bX, bY) => Math.hypot(bX - aX, bY - aY);

const getDirectionFromDelta = (dx, dy) => {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "front" : "back";
};

const getBattleConfig = (buildingType, level = 1) => {
  const config = BUILDING_WAR_CONFIG[buildingType] ?? {
    image: "/assets/command center.png",
    name: buildingType,
    health: 120,
  };

  return {
    image: config.image,
    name: config.name,
    health: config.health + Math.max(0, (Number(level ?? 1) - 1) * 40),
  };
};

const normalizeSnapshotBuildings = (buildings, fallbackUserId) => {
  const normalizedBuildings = Array.isArray(buildings)
    ? buildings
        .map((building, index) => ({
          id: building?.id ?? `${fallbackUserId}-building-${index}`,
          type: typeof building?.type === "string" ? building.type : null,
          x: Math.max(0, Math.min(GRID_COLS - 1, Number(building?.x ?? building?.col ?? 0) || 0)),
          y: Math.max(0, Math.min(GRID_ROWS - 1, Number(building?.y ?? building?.row ?? 0) || 0)),
          level: Math.max(1, Number(building?.level ?? 1) || 1),
          soldierCount: Math.max(0, Number(building?.soldierCount ?? 0) || 0),
        }))
        .filter((building) => building.type)
    : [];

  const hasTownHall = normalizedBuildings.some((building) => building.type === "town-hall");

  if (!hasTownHall) {
    normalizedBuildings.push({
      id: `${fallbackUserId}-synthetic-townhall`,
      type: "town-hall",
      x: 4,
      y: 4,
      level: 1,
      soldierCount: 0,
    });
  }

  return normalizedBuildings;
};

const createStructuresFromBuildings = (buildings, ownerId) =>
  buildings.map((building, index) => {
    const config = getBattleConfig(building.type, building.level);

    return {
      id: `${ownerId}-structure-${building.id ?? index}`,
      sourceId: building.id ?? null,
      type: building.type,
      row: Number(building.y ?? 0),
      col: Number(building.x ?? 0),
      image: config.image,
      name: config.name,
      maxHealth: config.health,
      health: config.health,
      level: building.level ?? 1,
    };
  });

const createBattlePlayer = (entry) => {
  const buildings = normalizeSnapshotBuildings(entry.snapshot?.buildings, entry.user.id);
  const totalSoldiers = buildings.reduce(
    (total, building) =>
      total + (building.type === "command-center" ? Math.max(0, Number(building.soldierCount ?? 0) || 0) : 0),
    0
  );

  return {
    userId: entry.user.id,
    name: entry.user.email,
    socketId: entry.socket.id,
    totalSoldiers,
    availableSoldiers: totalSoldiers,
    buildings,
    structures: createStructuresFromBuildings(buildings, entry.user.id),
    deployments: [],
    gold: Math.max(0, Number(entry.snapshot?.gold ?? 0) || 0),
    disconnected: false,
  };
};

const getPublicPlayerState = (player) => ({
  userId: player.userId,
  name: player.name,
  totalSoldiers: player.totalSoldiers,
  availableSoldiers: player.availableSoldiers,
  deployedSoldiers: player.deployments.length,
  gold: player.gold,
  buildings: player.buildings,
  structures: player.structures,
  deployments: player.deployments,
  disconnected: player.disconnected,
});

const emitRoomState = (io, room) => {
  const payload = {
    roomId: room.id,
    status: room.status,
    createdAt: room.createdAt,
    winnerUserId: room.winnerUserId,
    reason: room.reason ?? null,
    players: room.players.map(getPublicPlayerState),
  };

  io.to(room.id).emit("battle:state", payload);
};

const cleanupRoom = (roomId) => {
  const room = battleRooms.get(roomId);

  if (!room) {
    return;
  }

  room.players.forEach((player) => {
    if (playerRoomMap.get(player.userId) === roomId) {
      playerRoomMap.delete(player.userId);
    }
  });

  battleRooms.delete(roomId);
};

const finishRoom = (io, room, winnerUserId, reason) => {
  if (!room || room.status === "finished") {
    return;
  }

  room.status = "finished";
  room.winnerUserId = winnerUserId;
  room.reason = reason;

  emitRoomState(io, room);
  io.to(room.id).emit("battle:end", {
    roomId: room.id,
    winnerUserId,
    reason,
  });

  setTimeout(() => {
    cleanupRoom(room.id);
  }, 15000);
};

const createBattleRoom = (io, firstEntry, secondEntry) => {
  const roomId = `battle-${Date.now()}-${firstEntry.user.id}-${secondEntry.user.id}`;
  const room = {
    id: roomId,
    createdAt: Date.now(),
    status: "active",
    winnerUserId: null,
    reason: null,
    players: [createBattlePlayer(firstEntry), createBattlePlayer(secondEntry)],
  };

  battleRooms.set(roomId, room);
  playerRoomMap.set(firstEntry.user.id, roomId);
  playerRoomMap.set(secondEntry.user.id, roomId);
  firstEntry.socket.join(roomId);
  secondEntry.socket.join(roomId);

  io.to(roomId).emit("match:found", {
    roomId,
    players: room.players.map((player) => ({
      userId: player.userId,
      name: player.name,
    })),
  });

  emitRoomState(io, room);
};

const removeFromQueue = (socketId, userId) => {
  for (let index = matchmakingQueue.length - 1; index >= 0; index -= 1) {
    const entry = matchmakingQueue[index];

    if (entry.socket.id === socketId || (userId && entry.user.id === userId)) {
      matchmakingQueue.splice(index, 1);
    }
  }
};

const tryMatchmake = (io) => {
  if (matchmakingQueue.length < 2) {
    return;
  }

  for (let leftIndex = 0; leftIndex < matchmakingQueue.length; leftIndex += 1) {
    const leftEntry = matchmakingQueue[leftIndex];

    for (let rightIndex = leftIndex + 1; rightIndex < matchmakingQueue.length; rightIndex += 1) {
      const rightEntry = matchmakingQueue[rightIndex];

      if (leftEntry.user.id === rightEntry.user.id) {
        continue;
      }

      matchmakingQueue.splice(rightIndex, 1);
      matchmakingQueue.splice(leftIndex, 1);
      createBattleRoom(io, leftEntry, rightEntry);
      return;
    }
  }
};

const getRoomBySocket = (socket) => {
  const roomId = playerRoomMap.get(socket.user.id);
  if (!roomId) {
    return null;
  }

  return battleRooms.get(roomId) ?? null;
};

const handleDeploy = (io, socket, payload) => {
  const room = getRoomBySocket(socket);

  if (!room || room.status !== "active") {
    socket.emit("battle:error", { message: "No active battle room." });
    return;
  }

  const player = room.players.find((entry) => entry.userId === socket.user.id);
  const enemy = room.players.find((entry) => entry.userId !== socket.user.id);

  if (!player || !enemy) {
    socket.emit("battle:error", { message: "Battle players not found." });
    return;
  }

  const row = Number(payload?.row);
  const col = Number(payload?.col);

  if (
    !Number.isInteger(row)
    || !Number.isInteger(col)
    || row < DEPLOY_START_ROW
    || row >= GRID_ROWS
    || col < 0
    || col >= GRID_COLS
  ) {
    socket.emit("battle:error", { message: "Invalid deploy tile." });
    return;
  }

  if (player.availableSoldiers <= 0) {
    socket.emit("battle:error", { message: "No soldiers available." });
    return;
  }

  const tileOccupied = player.deployments.some(
    (deployment) => Math.round(deployment.row) === row && Math.round(deployment.col) === col
  );

  const enemyStructureOnTile = enemy.structures.some(
    (structure) => structure.health > 0 && structure.row === row && structure.col === col
  );

  if (tileOccupied || enemyStructureOnTile) {
    socket.emit("battle:error", { message: "Tile already occupied." });
    return;
  }

  player.availableSoldiers -= 1;
  player.deployments.push({
    id: `${player.userId}-${Date.now()}-${player.deployments.length}`,
    row,
    col,
    direction: "front",
    state: "walk",
    frameIndex: 0,
  });

  emitRoomState(io, room);
};

const runBattleTick = (io) => {
  battleRooms.forEach((room) => {
    if (room.status !== "active") {
      return;
    }

    room.players.forEach((attacker) => {
      const defender = room.players.find((entry) => entry.userId !== attacker.userId);

      if (!defender) {
        return;
      }

      attacker.deployments = attacker.deployments.map((soldier) => {
        const activeStructures = defender.structures.filter((structure) => structure.health > 0);

        if (activeStructures.length === 0) {
          return {
            ...soldier,
            state: "idle",
          };
        }

        let nearestStructure = activeStructures[0];
        let nearestDistance = Number.POSITIVE_INFINITY;

        activeStructures.forEach((structure) => {
          const distance = getDistance(soldier.col, soldier.row, structure.col, structure.row);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestStructure = structure;
          }
        });

        const dx = nearestStructure.col - soldier.col;
        const dy = nearestStructure.row - soldier.row;
        const direction = getDirectionFromDelta(dx, dy);

        if (nearestDistance <= SOLDIER_FIRE_RANGE) {
          defender.structures = defender.structures.map((structure) => {
            if (structure.id !== nearestStructure.id) {
              return structure;
            }

            return {
              ...structure,
              health: Math.max(0, structure.health - SOLDIER_DAMAGE_PER_TICK),
            };
          });

          return {
            ...soldier,
            direction,
            state: "firing",
            frameIndex: 0,
          };
        }

        const step = Math.min(SOLDIER_SPEED_PER_TICK, nearestDistance);
        const nextCol = soldier.col + (dx / nearestDistance) * step;
        const nextRow = soldier.row + (dy / nearestDistance) * step;

        return {
          ...soldier,
          col: nextCol,
          row: nextRow,
          direction,
          state: "walk",
          frameIndex: (soldier.frameIndex + 1) % 2,
        };
      });
    });

    const destroyedTownHallOwner = room.players.find((player) =>
      player.structures.some((structure) => structure.type === "town-hall" && structure.health <= 0)
    );

    if (destroyedTownHallOwner) {
      const winner = room.players.find((player) => player.userId !== destroyedTownHallOwner.userId);
      finishRoom(io, room, winner?.userId ?? null, "town-hall-destroyed");
      return;
    }

    emitRoomState(io, room);
  });
};

const getTokenFromHandshake = (socket) => {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const authorizationHeader = socket.handshake.headers?.authorization;

  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return null;
};

const getOnlineCount = () => onlineUsers.size;

const buildChatMessagePayload = (message) => ({
  id: message.id,
  userId: message.userId,
  playerId: message.playerId,
  name: message.name,
  text: message.text,
  createdAt: message.createdAt,
});

const buildMarketListingPayload = (listing) => ({
  id: listing.id,
  sellerUserId: listing.sellerUserId,
  sellerPlayerId: listing.sellerPlayerId,
  sellerName: listing.sellerName,
  listingType: listing.listingType,
  itemType: listing.itemType,
  itemLabel: listing.itemLabel,
  quantity: listing.quantity,
  priceGold: listing.priceGold ?? null,
  desiredItemType: listing.desiredItemType ?? null,
  desiredItemLabel: listing.desiredItemLabel ?? null,
  desiredQuantity: listing.desiredQuantity ?? null,
  createdAt: listing.createdAt,
});

const emitPresenceUpdate = (io) => {
  io.emit("presence:update", {
    onlineCount: getOnlineCount(),
  });
};

const emitMarketListings = (io, target = null) => {
  const payload = {
    listings: globalMarketListings.map(buildMarketListingPayload),
  };

  if (target) {
    target.emit("market:listings", payload);
    return;
  }

  io.to(GLOBAL_MARKET_ROOM).emit("market:listings", payload);
};

export const createBattleSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);

      if (!token) {
        next(new Error("No token"));
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: {
          id: decoded.id,
        },
        select: {
          id: true,
          name: true,
          playerId: true,
          email: true,
        },
      });

      if (!user) {
        next(new Error("User not found"));
        return;
      }

      socket.user = user;
      next();
    } catch (_error) {
      next(new Error("Not authorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(GLOBAL_CHAT_ROOM);
    socket.join(GLOBAL_MARKET_ROOM);
    const existingSockets = onlineUsers.get(socket.user.id) ?? new Set();
    existingSockets.add(socket.id);
    onlineUsers.set(socket.user.id, existingSockets);

    socket.emit("socket:ready", {
      userId: socket.user.id,
      name: socket.user.name || socket.user.email,
      playerId: socket.user.playerId || `PLYR-${String(socket.user.id).padStart(6, "0")}`,
    });
    socket.emit("presence:update", {
      onlineCount: getOnlineCount(),
    });
    socket.emit("chat:history", {
      messages: globalChatMessages.map(buildChatMessagePayload),
    });
    emitMarketListings(io, socket);
    emitPresenceUpdate(io);

    socket.on("queue:join", (payload = {}) => {
      const existingRoom = getRoomBySocket(socket);

      if (existingRoom && existingRoom.status === "active") {
        emitRoomState(io, existingRoom);
        return;
      }

      removeFromQueue(socket.id, socket.user.id);
      matchmakingQueue.push({
        socket,
        user: socket.user,
        snapshot: {
          gold: Math.max(0, Number(payload?.gold ?? 0) || 0),
          buildings: Array.isArray(payload?.buildings) ? payload.buildings : [],
        },
      });

      socket.emit("queue:waiting", {
        queuedAt: Date.now(),
      });

      tryMatchmake(io);
    });

    socket.on("queue:cancel", () => {
      removeFromQueue(socket.id, socket.user.id);
      socket.emit("queue:cancelled");
    });

    socket.on("battle:deploy", (payload) => {
      handleDeploy(io, socket, payload);
    });

    socket.on("battle:leave", () => {
      removeFromQueue(socket.id, socket.user.id);

      const room = getRoomBySocket(socket);

      if (!room || room.status === "finished") {
        return;
      }

      const opponent = room.players.find((player) => player.userId !== socket.user.id);
      finishRoom(io, room, opponent?.userId ?? null, "player-left");
    });

    socket.on("chat:send", (payload = {}) => {
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";

      if (!text) {
        return;
      }

      const message = {
        id: `${socket.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: socket.user.id,
        playerId: socket.user.playerId || `PLYR-${String(socket.user.id).padStart(6, "0")}`,
        name: socket.user.name || socket.user.email || `Commander ${socket.user.id}`,
        text: text.slice(0, 240),
        createdAt: Date.now(),
      };

      globalChatMessages.push(message);
      if (globalChatMessages.length > MAX_GLOBAL_CHAT_MESSAGES) {
        globalChatMessages.splice(0, globalChatMessages.length - MAX_GLOBAL_CHAT_MESSAGES);
      }

      io.to(GLOBAL_CHAT_ROOM).emit("chat:message", buildChatMessagePayload(message));
    });

    socket.on("market:listings:request", () => {
      emitMarketListings(io, socket);
    });

    socket.on("market:listing:create", (payload = {}, reply) => {
      const respond = (response) => {
        if (typeof reply === "function") {
          reply(response);
        }
      };

      const listingType = payload?.listingType === "trade" ? "trade" : "sell";
      const itemType = typeof payload?.itemType === "string"
        ? payload.itemType.trim().toLowerCase()
        : "";
      const quantity = Math.max(1, Math.min(999, Math.floor(Number(payload?.quantity ?? 1) || 1)));
      const normalizedPriceGold = Math.max(0, Math.floor(Number(payload?.priceGold ?? 0) || 0));
      const desiredItemType = typeof payload?.desiredItemType === "string"
        ? payload.desiredItemType.trim().toLowerCase()
        : "";
      const desiredQuantity = Math.max(1, Math.min(999, Math.floor(Number(payload?.desiredQuantity ?? 1) || 1)));

      if (!MARKET_ITEM_LABELS[itemType]) {
        const errorMessage = "Invalid market item.";
        socket.emit("market:error", { message: errorMessage });
        respond({ ok: false, message: errorMessage });
        return;
      }

      if (listingType === "trade" && !MARKET_ITEM_LABELS[desiredItemType]) {
        const errorMessage = "Choose a valid trade target item.";
        socket.emit("market:error", { message: errorMessage });
        respond({ ok: false, message: errorMessage });
        return;
      }

      const listing = {
        id: `${socket.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sellerUserId: socket.user.id,
        sellerPlayerId: socket.user.playerId || `PLYR-${String(socket.user.id).padStart(6, "0")}`,
        sellerName: socket.user.name || socket.user.email || `Commander ${socket.user.id}`,
        listingType,
        itemType,
        itemLabel: MARKET_ITEM_LABELS[itemType],
        quantity,
        priceGold: listingType === "sell" ? normalizedPriceGold : null,
        desiredItemType: listingType === "trade" ? desiredItemType : null,
        desiredItemLabel: listingType === "trade" ? MARKET_ITEM_LABELS[desiredItemType] : null,
        desiredQuantity: listingType === "trade" ? desiredQuantity : null,
        createdAt: Date.now(),
      };

      globalMarketListings.unshift(listing);
      if (globalMarketListings.length > MAX_GLOBAL_MARKET_LISTINGS) {
        globalMarketListings.splice(MAX_GLOBAL_MARKET_LISTINGS);
      }

      emitMarketListings(io);
      const listingPayload = buildMarketListingPayload(listing);
      socket.emit("market:listing:created", listingPayload);
      respond({ ok: true, listing: listingPayload });
    });

    socket.on("market:listing:cancel", (payload = {}, reply) => {
      const respond = (response) => {
        if (typeof reply === "function") {
          reply(response);
        }
      };

      const listingId = typeof payload?.listingId === "string" ? payload.listingId.trim() : "";

      if (!listingId) {
        const errorMessage = "Missing listing id.";
        socket.emit("market:error", { message: errorMessage });
        respond({ ok: false, message: errorMessage });
        return;
      }

      const listingIndex = globalMarketListings.findIndex((listing) => listing.id === listingId);

      if (listingIndex === -1) {
        const errorMessage = "Listing not found.";
        socket.emit("market:error", { message: errorMessage });
        respond({ ok: false, message: errorMessage });
        return;
      }

      const listing = globalMarketListings[listingIndex];

      if (String(listing.sellerUserId) !== String(socket.user.id)) {
        const errorMessage = "You can only cancel your own listing.";
        socket.emit("market:error", { message: errorMessage });
        respond({ ok: false, message: errorMessage });
        return;
      }

      globalMarketListings.splice(listingIndex, 1);
      emitMarketListings(io);
      const cancelledPayload = {
        listingId,
      };
      socket.emit("market:listing:cancelled", cancelledPayload);
      respond({ ok: true, ...cancelledPayload });
    });

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(socket.user.id);
      if (sockets) {
        sockets.delete(socket.id);

        if (sockets.size === 0) {
          onlineUsers.delete(socket.user.id);
        } else {
          onlineUsers.set(socket.user.id, sockets);
        }
      }

      emitPresenceUpdate(io);
      removeFromQueue(socket.id, socket.user.id);

      const room = getRoomBySocket(socket);

      if (!room || room.status === "finished") {
        return;
      }

      const disconnectedPlayer = room.players.find((player) => player.userId === socket.user.id);
      const opponent = room.players.find((player) => player.userId !== socket.user.id);

      if (disconnectedPlayer) {
        disconnectedPlayer.disconnected = true;
      }

      finishRoom(io, room, opponent?.userId ?? null, "player-disconnected");
    });
  });

  setInterval(() => {
    runBattleTick(io);
  }, BATTLE_TICK_MS);

  return io;
};
