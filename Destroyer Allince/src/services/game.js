import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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
