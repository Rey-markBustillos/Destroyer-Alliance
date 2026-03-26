import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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
