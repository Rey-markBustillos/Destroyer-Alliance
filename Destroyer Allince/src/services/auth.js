import axios from "axios";

import { API_BASE_URL } from "./apiConfig";

const authApi = axios.create({
  baseURL: `${API_BASE_URL}/auth`,
});

export const register = async (payload) => {
  const { data } = await authApi.post("/register", payload);
  return data;
};

export const login = async (payload) => {
  const { data } = await authApi.post("/login", payload);
  return data;
};

export const fetchProfile = async (token) => {
  const { data } = await authApi.get("/profile", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const fetchLeaderboard = async (token) => {
  const { data } = await authApi.get("/leaderboard", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};

export const updateProfileName = async (token, name) => {
  const { data } = await authApi.patch("/profile/name", { name }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return data;
};
