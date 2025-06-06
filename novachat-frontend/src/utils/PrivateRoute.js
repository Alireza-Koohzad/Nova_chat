import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// روش اول: استفاده از children (همانطور که در App.js استفاده کردیم)
// function PrivateRoute({ children }) {
//   const { isAuthenticated, isLoading } = useAuth();
//   if (isLoading) {
//     return <div>Loading authentication state...</div>; // یا یک اسپینر
//   }
//   return isAuthenticated ? children : <Navigate to="/login" replace />;
// }
// export default PrivateRoute;


// روش دوم: استفاده از <Outlet /> برای روت‌های تو در تو (nested routes)
// این روش برای زمانی که PrivateRoute خودش یک روت در Routes باشد مفیدتر است
const PrivateRoute = () => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <div>Loading authentication...</div>; // یا یک کامپوننت اسپینر
    }

    return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};
export default PrivateRoute;