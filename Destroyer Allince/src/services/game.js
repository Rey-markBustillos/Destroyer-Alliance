import axios from "axios";

import { API_BASE_URL } from "./apiConfig";

const gameApi = axios.create({
  baseURL: `${API_BASE_URL}/game`,
});

export const fetchBuildings = async (token) => {
  const { data } = await gameApi.get("/buildings", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const fetchGameState = async (token) => {
  const { data } = await gameApi.get("/state", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const fetchGameSnapshot = async (token) => {
  const { data } = await gameApi.get("/snapshot", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const fetchWarTarget = async (token, playerId = "") => {
  const { data } = await gameApi.get("/war-target", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params: playerId ? { playerId } : undefined,
  });

  return data;
};

export const syncGameSnapshot = async (payload, token) => {
  const { data } = await gameApi.put("/snapshot", payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const fetchWarEnemies = async (token) => {
  const { data } = await gameApi.get("/war-enemies", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const applyWarResolution = async (payload, token) => {
  const { data } = await gameApi.post("/war-resolution", payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const updateGameState = async (payload, token) => {
  const { data } = await gameApi.put("/state", payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const addBuilding = async (payload, token) => {
  const { data } = await gameApi.post("/build", payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const updateBuilding = async (id, payload, token) => {
  const { data } = await gameApi.put(`/buildings/${id}`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const deleteBuilding = async (id, token) => {
  const { data } = await gameApi.delete(`/buildings/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};
