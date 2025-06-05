// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    const currentPath = window.location.pathname;

    if (currentPath.includes('index.html')) {
        if (!token) {
            window.location.href = 'login.html'; // اگر توکن نیست، به لاگین برو
        } else {
            // اگر در صفحه اصلی هستیم و توکن داریم، توابع چت را راه‌اندازی کن
            if (typeof initChatPage === 'function') {
                initChatPage();
            } else {
                console.error('initChatPage function not found. Make sure chat.js is loaded.');
            }
        }
    } else if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
        if (token) {
            window.location.href = 'index.html'; // اگر توکن هست و در صفحه لاگین/رجیستر هستیم، به اصلی برو
        }
        // توابع auth.js به صورت خودکار event listener ها را برای فرم‌ها ست می‌کنند
    }
});