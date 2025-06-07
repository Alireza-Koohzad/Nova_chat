import {io} from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000'; // آدرس از .env یا پیش‌فرض
let socket;

const socketService = {
    connect: (token) => {
        if (socket && socket.connected) {
            console.log('Socket already connected:', socket.id);
            return;
        }
        // اگر socket وجود دارد ولی متصل نیست (مثلا disconnect شده)، دوباره با همان instance وصل شو
        if (socket && !socket.connected) {
            console.log('Socket exists but not connected, attempting to reconnect with new token...');
            socket.auth.token = token; // آپدیت توکن اگر لازم است
            socket.connect();
            return;
        }
        // اگر socket اصلا وجود ندارد، یکی جدید بساز
        console.log('Creating new socket connection...');
        socket = io(SOCKET_URL, {
            auth: {token},
            transports: ['websocket'], // برای اطمینان
        });

        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            // اگر دلیل disconnect از طرف سرور یا کلاینت به صورت دستی بود،
            // ممکن است نخواهیم به طور خودکار وصل شویم یا باید state را مدیریت کنیم
            if (reason === 'io server disconnect' || reason === 'io client disconnect') {
                // socket = null; // شاید بخواهیم instance را پاک کنیم تا connect بعدی جدید بسازد
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            // اینجا می‌توانید منطق لاگ اوت کاربر در صورت خطای احراز هویت را اضافه کنید
            if (error.message.includes('Authentication error')) {
                // dispatch logout action or redirect
                console.error("Socket auth error, user should be logged out.");
                // اینجا باید به AuthContext اطلاع داده شود تا کاربر را logout کند
                // این کار را می‌توان با یک event emitter سفارشی یا callback انجام داد
            }
        });
    },
    isConnected: () => {
        return socket && socket.connected;
    },
    disconnect: () => {
        if (socket) {
            socket.disconnect();
            socket = null; // پاک کردن instance
            console.log('Socket disconnected by client.');
        }
    },

    // --- Emitters (ارسال رویداد به سرور) ---
    joinChat: (chatId) => {
        if (socket) socket.emit('joinChat', chatId);
    },

    leaveChat: (chatId) => {
        if (socket) socket.emit('leaveChat', chatId);
    },

    sendMessage: (messageData) => { // { chatId, content, tempId }
        if (socket) socket.emit('sendMessage', messageData);
    },

    sendTyping: (typingData) => { // { chatId, isTyping }
        if (socket) socket.emit('typing', typingData);
    },

    markMessagesAsRead: (readData) => { // { chatId, lastSeenMessageId }
        if (socket) socket.emit('markMessagesAsRead', readData);
    },


    // --- Listeners (گوش دادن به رویدادهای سرور) ---
    // برای هر رویداد یک تابع on و یک تابع off برای حذف listener ایجاد می‌کنیم

    onNewMessage: (callback) => {
        if (socket) socket.on('newMessage', callback);
    },
    offNewMessage: (callback) => {
        if (socket) socket.off('newMessage', callback);
    },

    onTyping: (callback) => {
        if (socket) socket.on('typing', callback);
    },
    offTyping: (callback) => {
        if (socket) socket.off('typing', callback);
    },

    onMessageStatusUpdate: (callback) => {
        if (socket) socket.on('messageStatusUpdate', callback);
    },
    offMessageStatusUpdate: (callback) => {
        if (socket) socket.off('messageStatusUpdate', callback);
    },

    onMessagesReadByRecipient: (callback) => {
        if (socket) socket.on('messagesReadByRecipient', callback);
    },
    offMessagesReadByRecipient: (callback) => {
        if (socket) socket.off('messagesReadByRecipient', callback);
    },

    onUserStatusChanged: (callback) => {
        if (socket) socket.on('userStatusChanged', callback);
    },
    offUserStatusChanged: (callback) => { // برای اینکه ChatPage بتواند listener را حذف کند
        if (socket) socket.off('userStatusChanged', callback);
    },
    onMessagesSuccessfullyMarkedAsRead: (callback) => {
        if (socket) socket.on('messagesSuccessfullyMarkedAsRead', callback);
    },
    offMessagesSuccessfullyMarkedAsRead: (callback) => {
        if (socket) socket.off('messagesSuccessfullyMarkedAsRead', callback);
    },
    onCurrentOnlineUsers: (callback) => {
        if (socket) socket.on('currentOnlineUsers', callback);
    },
    offCurrentOnlineUsers: (callbackOrEventName) => { // می‌تواند callback یا فقط نام رویداد را بگیرد
        if (socket) {
            if (typeof callbackOrEventName === 'function') {
                socket.off('currentOnlineUsers', callbackOrEventName);
            } else {
                // اگر callback ارسال نشده، همه listener های این رویداد را حذف کن (برای سادگی در ChatPage)
                socket.off('currentOnlineUsers');
            }
        }
    },
    onNewChat: (callback) => { if (socket) socket.on('newChat', callback); },
    offNewChat: (callback) => { if (socket) socket.off('newChat', callback); },



    // --- Error Listeners ---
    onMessageError: (callback) => {
        if (socket) socket.on('messageError', callback);
    },
    offMessageError: (callback) => {
        if (socket) socket.off('messageError', callback);
    },

    // برای موارد دیگر هم می‌توانید به همین شکل اضافه کنید
};

export default socketService;