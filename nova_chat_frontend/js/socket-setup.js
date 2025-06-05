// js/socket-setup.js
// این فایل باید قبل از chat.js و main.js لود شود

const SOCKET_URL = 'http://localhost:3000'; // آدرس سرور Socket.IO
let socket; // متغیر گلوبال برای سوکت

function initializeSocket(token) {
    if (socket && socket.connected) {
        return socket;
    }

    socket = io(SOCKET_URL, {
        auth: {
            token: token
        },
        // transports: ['websocket'] // برای اطمینان از استفاده از WebSocket (اختیاری)
    });

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        // می‌توانید رویدادهای اولیه اتصال را اینجا مدیریت کنید
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        // ممکن است بخواهید تلاش برای اتصال مجدد یا لاگ اوت کاربر را اینجا مدیریت کنید
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
            // اگر سرور یا کلاینت به صراحت دیسکانکت کرده
        } else {
            // تلاش برای اتصال مجدد به صورت خودکار توسط Socket.IO انجام می شود
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        // اگر خطای احراز هویت بود، کاربر را لاگ اوت کن
        if (error.message.includes('Authentication error')) {
            alert('Authentication failed. Please login again.');
            handleLogout(); // تابع handleLogout از auth.js باید در دسترس باشد
        }
    });

    // رویدادهای گلوبال سوکت را اینجا می‌توانید اضافه کنید
    // مانند userStatusChanged, messageStatusUpdate و غیره که در chat.js استفاده می‌شوند
    // یا اینکه chat.js مستقیما به socket دسترسی داشته باشد و listener ها را ثبت کند

    window.socket = socket; // در دسترس قرار دادن سوکت به صورت گلوبال (برای سادگی)
    return socket;
}