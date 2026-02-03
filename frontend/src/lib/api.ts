import axios from 'axios';

// Bun/Vite uses VITE_ prefix for env variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
});