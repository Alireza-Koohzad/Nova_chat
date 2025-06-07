import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';
import socketService from '../services/socketService'; // اگر قبلا import نشده

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true); // برای بررسی اولیه توکن

    useEffect(() => {
        const initializeAuth = async () => {
            const storedToken = authService.getAuthToken();
            if (storedToken) {
                try {
                    // به جای خواندن مستقیم از localStorage، اطلاعات کاربر را از سرور بگیریم
                    // تا مطمئن شویم توکن هنوز معتبر است و اطلاعات کاربر بروز است.
                    const profile = await authService.fetchCurrentUserProfile(storedToken);
                    if (profile) {
                        setUser(profile);
                        setToken(storedToken);
                    } else { // اگر پروفایل برنگشت (مثلا توکن نامعتبر)
                        authService.logout(); // پاک کردن توکن‌های نامعتبر
                    }
                } catch (error) {
                    console.error("Error initializing auth:", error);
                    authService.logout(); // در صورت خطا، لاگ اوت کن
                }
            }
            setIsLoading(false);
        };
        initializeAuth();
    }, []);

    const login = async (credentials) => {
        try {
            const data = await authService.login(credentials);
            setUser(data.user);
            setToken(data.token);
            return data; // برای امکان handle کردن بیشتر در کامپوننت
        } catch (error) {
            // خطا قبلا در authService لاگ شده، اینجا فقط re-throw می‌کنیم
            throw error;
        }
    };

    const register = async (userData) => {
        try {
            const data = await authService.register(userData);
            setUser(data.user);
            setToken(data.token);
            return data;
        } catch (error) {
            throw error;
        }
    };

    const logout = () => {
        if (socketService.isConnected()) {
            socketService.disconnect();
            console.log("Socket disconnected on logout.");
        } else {
            console.log("Socket was not connected on logout.");
        }
        authService.logout();
        setUser(null);
        setToken(null);
        // در فازهای بعدی، اتصال سوکت هم اینجا قطع می‌شود

    };

    const value = {
        user,
        token,
        isAuthenticated: !!token, // اگر توکن وجود دارد، کاربر احراز هویت شده
        isLoading,
        login,
        register,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};