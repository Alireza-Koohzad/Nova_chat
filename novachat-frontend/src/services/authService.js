import axios from 'axios';
import { API_BASE_URL } from '../constants/apiConfig';

const authService = {
    login: async (credentials) => { // credentials: { login, password }
        try {
            const response = await axios.post(`${API_BASE_URL}/auth/login`, credentials);
            if (response.data && response.data.token) {
                localStorage.setItem('authToken', response.data.token);
                localStorage.setItem('currentUser', JSON.stringify(response.data.user));
            }
            return response.data; // شامل token و user
        } catch (error) {
            console.error('Login API error:', error.response?.data || error.message);
            throw error.response?.data || new Error('Login failed');
        }
    },

    register: async (userData) => { // userData: { username, email, password, displayName }
        try {
            const response = await axios.post(`${API_BASE_URL}/auth/register`, userData);
            if (response.data && response.data.token) {
                localStorage.setItem('authToken', response.data.token);
                localStorage.setItem('currentUser', JSON.stringify(response.data.user));
            }
            return response.data;
        } catch (error) {
            console.error('Register API error:', error.response?.data || error.message);
            throw error.response?.data || new Error('Registration failed');
        }
    },

    logout: () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        // در فازهای بعدی، باید اتصال سوکت را هم اینجا قطع کنیم
    },

    getCurrentUser: () => {
        const userStr = localStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    },

    getAuthToken: () => {
        return localStorage.getItem('authToken');
    },

    // (اختیاری) برای درخواست اطلاعات کاربر فعلی از سرور با توکن
    fetchCurrentUserProfile: async (token) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data && response.data.user) {
                localStorage.setItem('currentUser', JSON.stringify(response.data.user));
                return response.data.user;
            }
            return null;
        } catch (error) {
            console.error('Fetch current user profile error:', error.response?.data || error.message);
            // اگر توکن نامعتبر بود، لاگ اوت کن
            if (error.response && error.response.status === 401) {
                authService.logout();
            }
            throw error.response?.data || new Error('Failed to fetch profile');
        }
    }
};

export default authService;