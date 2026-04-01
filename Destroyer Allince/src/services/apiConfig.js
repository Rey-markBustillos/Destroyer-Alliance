const DEFAULT_API_URL = "https://destroyer-alliance-1.onrender.com/api";

const normalizeApiUrl = (value) => value.replace(/\/+$/, "");

export const API_BASE_URL = normalizeApiUrl(
  import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL
);

export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");
