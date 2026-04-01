const DEFAULT_PRODUCTION_API_URL = "https://destroyer-alliance-backend.onrender.com/api";

const getDefaultApiUrl = () => {
  if (import.meta.env.DEV) {
    return "/api";
  }

  return DEFAULT_PRODUCTION_API_URL;
};

const normalizeApiUrl = (value) => value.replace(/\/+$/, "");

export const API_BASE_URL = normalizeApiUrl(
  import.meta.env.VITE_API_URL?.trim() || getDefaultApiUrl()
);

export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");
