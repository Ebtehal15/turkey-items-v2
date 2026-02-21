import axios from 'axios';

// Dinamik API base URL - dış IP erişimi için
const getApiBaseUrl = () => {
  // Environment variable varsa onu kullan
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Production'da aynı origin kullan (tek servis deploy: frontend + API aynı host)
  // Ayrı frontend deploy için VITE_API_BASE_URL kullanın
  if (import.meta.env.PROD) {
    return '';
  }
  
  // Development'ta dış IP erişimi için sabit IP kullan
  // Dış IP: 192.168.1.204
  const EXTERNAL_IP = '192.168.1.204';
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Eğer localhost değilse, belirtilen dış IP'yi kullan
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${EXTERNAL_IP}:4000`;
    }
    
    // Localhost'ta da port 4000 kullan
    return 'http://localhost:4000';
  }
  
  // Varsayılan olarak localhost
  return 'http://localhost:4000';
};

const baseURL = getApiBaseUrl();

const apiClient = axios.create({
  baseURL,
  withCredentials: true, // Session cookie'leri için gerekli
});

// Request interceptor - giden istekleri logla
apiClient.interceptors.request.use(
  (config) => {
    console.log('🚀 API Request:', config.method?.toUpperCase(), config.url, config.data);
    console.log('🍪 Request cookies:', document.cookie);
    console.log('🔧 Request config:', {
      withCredentials: config.withCredentials,
      baseURL: config.baseURL
    });
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - gelen cevapları logla
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url, response.data);
    console.log('🍪 Response cookies after request:', document.cookie);
    console.log('🔧 Response headers:', {
      'set-cookie': response.headers['set-cookie'],
      'access-control-allow-credentials': response.headers['access-control-allow-credentials']
    });
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.status, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;


















