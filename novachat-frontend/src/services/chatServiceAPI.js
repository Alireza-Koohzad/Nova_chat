import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const chatServiceAPI = {
    // --- Chat related API calls ---
    getUserChats: async (token) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/chats`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data; // آرایه‌ای از چت‌ها
        } catch (error) {
            console.error('API Error fetching user chats:', error.response?.data || error.message);
            throw error.response?.data || new Error('Failed to fetch user chats');
        }
    },

    createOrGetPrivateChat: async (recipientId, token) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/chats/private/${recipientId}`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data; // آبجکت چت
        } catch (error) {
            console.error('API Error creating/getting private chat:', error.response?.data || error.message);
            throw error.response?.data || new Error('Failed to start private chat');
        }
    },

    getChatMessages: async (chatId, token, limit = 30, offset = 0) => { // Increased default limit
        try {
            const response = await axios.get(`${API_BASE_URL}/chats/${chatId}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit, offset, order: 'ASC' }, // Request ascending order
            });
            // Backend already reverses DESC order, so client receives ASC (oldest first).
            // No client-side reversal needed if API adheres to this.
            return response.data;
        } catch (error) {
            console.error('API Error fetching messages:', error.response?.data || error.message);
            throw error.response?.data || new Error('Failed to fetch messages');
        }
    },

    // --- User Search (اگر پیاده سازی شده باشد) ---
    searchUsers: async (query, token) => {
        if (!query || query.length < 2) return []; // حداقل ۲ کاراکتر برای جستجو
        try {
            const response = await axios.get(`${API_BASE_URL}/users/search`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { q: query },
            });
            return response.data.data || []; // فرض بر اینکه API شما { success: true, data: [...] } برمی‌گرداند
        } catch (error) {
            console.error('API Error searching users:', error.response?.data || error.message);
            // بهتر است خطا را به صورت مشخص‌تری مدیریت کنید تا UI بتواند پیام مناسب نمایش دهد
            return []; // در صورت خطا، آرایه خالی برگردان
        }
    }

    // ... سایر توابع API چت در آینده ...
};

export default chatServiceAPI;