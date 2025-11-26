import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

const apiClient = axios.create({
  baseURL,
  withCredentials: true, // Session cookie'leri için gerekli
});

export default apiClient;


















