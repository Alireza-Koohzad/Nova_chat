// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // ماژول http خود Node.js
const { Server } = require('socket.io'); // Server از socket.io
const { connectDB, sequelize } = require('./config/database');
const setupSwagger = require('./config/swagger');

// Import مدل‌ها
require('./models/User');
const Chat = require('./models/Chat'); // مدل جدید
const Message = require('./models/Message'); // مدل جدید
const ChatMember = require('./models/ChatMember'); // مدل جدید
const defineAssociations = require('./models/associations');

// Import روت‌ها
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes'); // روت جدید برای چت

const app = express();
const server = http.createServer(app); // ایجاد سرور HTTP از app اکسپرس
const io = new Server(server, { // مقداردهی اولیه Socket.IO با سرور HTTP
    cors: {
        origin: "*", // در پروداکشن باید به دامین فرانت‌اند محدود شود
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// فراخوانی تابع برای تعریف روابط
defineAssociations();

// اتصال به پایگاه داده
connectDB();

// Middleware ها
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

setupSwagger(app);

// روت‌های اصلی
app.get('/', (req, res) => {
    res.send('NovaChat API (Express.js with Socket.IO) is running!');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes); // استفاده از روت‌های چت

// Middleware برای مدیریت خطاهای عمومی
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ success: false, message: 'Something broke!', error: err.message });
});

// ** منطق Socket.IO **
// یک middleware برای احراز هویت کاربران Socket.IO
const { verifySocketToken } = require('./middleware/socketAuthMiddleware'); // این فایل را ایجاد خواهیم کرد
io.use(verifySocketToken);


io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}, UserID: ${socket.userId}`); // userId از middleware می‌آید

    // پیوستن به روم شخصی کاربر (برای نوتیفیکیشن‌های مستقیم و غیره)
    socket.join(socket.userId);

    // رویداد برای پیوستن به یک چت خاص
    socket.on('joinChat', (chatId) => {
        socket.join(chatId);
        console.log(`User ${socket.userId} (socket ${socket.id}) joined chat ${chatId}`);
    });

    // رویداد برای ترک یک چت خاص
    socket.on('leaveChat', (chatId) => {
        socket.leave(chatId);
        console.log(`User ${socket.userId} (socket ${socket.id}) left chat ${chatId}`);
    });

    // رویداد برای ارسال پیام جدید
    socket.on('sendMessage', async (data) => {
        // data: { chatId: string, content: string, tempId?: string }
        // tempId یک شناسه موقت از سمت کلاینت برای پیگیری پیام قبل از ذخیره در دیتابیس است
        try {
            const { chatId, content, tempId } = data;
            const senderId = socket.userId;

            // ۱. بررسی اینکه آیا کاربر عضو چت هست (برای امنیت بیشتر)
            const chatMember = await ChatMember.findOne({ where: { chatId, userId: senderId } });
            if (!chatMember) {
                socket.emit('messageError', { tempId, message: "You are not a member of this chat." });
                return;
            }

            // ۲. ذخیره پیام در دیتابیس
            const message = await Message.create({
                chatId,
                senderId,
                content, // فعلا فقط متنی
                contentType: 'text',
            });

            const messageData = message.toJSON();
            // افزودن اطلاعات فرستنده به پیام (می‌تواند از User.findByPk انجام شود)
            // const sender = await User.findByPk(senderId, { attributes: ['id', 'username', 'displayName', 'profileImageUrl'] });
            // messageData.sender = sender;


            // ۳. ارسال پیام به تمام اعضای چت (در روم مربوطه)
            io.to(chatId).emit('newMessage', { ...messageData, tempId }); // ارسال tempId برای تطبیق در کلاینت

            // (اختیاری) ارسال وضعیت Delivered به فرستنده (یا به همه، اگر پیام به گیرنده خاصی رسید)
            // این بخش پیچیده‌تر می‌شود وقتی که بخواهیم وضعیت Delivered را برای هر گیرنده جداگانه پیگیری کنیم.
            // برای چت خصوصی:
            const chat = await Chat.findByPk(chatId, { include: [ChatMember] });
            if (chat && chat.type === 'private') {
                const otherMember = chat.ChatMembers.find(member => member.userId !== senderId);
                if (otherMember) {
                    // به روم شخصی کاربر دیگر پیام delivered بفرست اگر آنلاین است
                    io.to(otherMember.userId).emit('messageDelivered', { messageId: message.id, chatId });
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('messageError', { tempId: data.tempId, message: "Error sending message" });
        }
    });

    // رویداد برای نشانگر "در حال تایپ"
    socket.on('typing', (data) => {
        // data: { chatId: string, isTyping: boolean }
        const { chatId, isTyping } = data;
        // ارسال به همه کاربران در چت به جز خود فرستنده
        socket.to(chatId).emit('typing', { userId: socket.userId, chatId, isTyping });
    });


    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}, UserID: ${socket.userId}`);
        //  بروزرسانی lastSeenAt در دیتابیس
        // و اطلاع رسانی به چت‌های فعال کاربر که او آفلاین شده است
    });
});


// همگام‌سازی پایگاه داده و راه‌اندازی سرور
const startServer = async () => {
    try {
        await sequelize.sync({ alter: true });
        console.log('Database synchronized successfully.');

        server.listen(PORT, () => { // به جای app.listen از server.listen استفاده کنید
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to sync database or start server:', error);
        process.exit(1);
    }
};

startServer();