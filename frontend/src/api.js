import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://crisiz-ai.onrender.com';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

export const fetchState = () => api.get('/state').then(r => r.data);
export const fetchZones = () => api.get('/zones').then(r => r.data);
export const fetchAlerts = () => api.get('/alerts').then(r => r.data);
export const fetchStrategy = () => api.get('/strategy').then(r => r.data);
export const fetchForecast = () => api.get('/forecast').then(r => r.data);
export const fetchResources = () => api.get('/resources').then(r => r.data);
export const fetchShelters = () => api.get('/shelters').then(r => r.data);
export const fetchLogs = () => api.get('/logs').then(r => r.data);

export const postCitizenPing = (ping) => api.post('/citizen-ping', ping).then(r => r.data);
export const postSimulate = (params) => api.post('/simulate', params).then(r => r.data);
export const regenerateStrategy = () => api.post('/strategy/regenerate').then(r => r.data);
export const fetchHealth = () => api.get('/health').then(r => r.data);

export default api;
