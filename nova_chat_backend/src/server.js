// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // ماژول http خود Node.js
const {Server} = require('socket.io'); // Server از socket.io
const {connectDB, sequelize} = require('./config/database');
const setupSwagger = require('./config/swagger');
const {Op} = require('sequelize');
// Import مدل‌ها
require('./models/User');
const Chat = require('./models/Chat'); // مدل جدید
const User = require('./models/User'); // مدل جدید
const Message = require('./models/Message'); // مدل جدید
const ChatMember = require('./models/ChatMember'); // مدل جدید
const defineAssociations = require('./models/Associations');

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
app.use(express.urlencoded({extended: true}));

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
    res.status(500).send({success: false, message: 'Something broke!', error: err.message});
});

// ** منطق Socket.IO **
// یک middleware برای احراز هویت کاربران Socket.IO
const {verifySocketToken} = require('./middleware/socketAuthMiddleware'); // این فایل را ایجاد خواهیم کرد
io.use(verifySocketToken);


io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.id}, UserID: ${socket.userId}`); // userId از middleware می‌آید

    // پیوستن به روم شخصی کاربر (برای نوتیفیکیشن‌های مستقیم و غیره)
    socket.join(socket.userId);

    try {
        // ۱. بروزرسانی وضعیت کاربر به 'online' و lastSeenAt
        await User.update({status: 'online', lastSeenAt: new Date()}, {where: {id: socket.userId}});

        // ۲. به دوستان/مخاطبین آنلاین کاربر اطلاع بده که او آنلاین شده است
        // (این بخش نیازمند سیستم دوستی است که بعدا اضافه می کنیم. فعلا فرض می کنیم به همه کاربران در چت های مشترک اطلاع می دهیم)
        // یا یک رویداد کلی تر:
        socket.broadcast.emit('userStatusChanged', {userId: socket.userId, status: 'online', lastSeenAt: new Date()});

        // ۳. به کلاینت لیست کاربران آنلاین (یا وضعیت دوستانش) را بفرست (اختیاری)
        // socket.emit('onlineUsersList', await getOnlineFriends(socket.userId));

    } catch (error) {
        console.error("Error updating user status on connect:", error);
    }
    // ** جدید: ارسال لیست کاربران آنلاین به کلاینت تازه متصل شده **
    try {
        const onlineUsers = await User.findAll({
            where: { status: 'online', id: { [Op.ne]: socket.userId } }, // به جز خودش
            attributes: ['id', 'status', 'lastSeenAt']
        });
        // یا فقط کاربرانی که با socket.userId چت مشترک دارند یا دوست هستند (پیچیده تر)

        socket.emit('currentOnlineUsers', onlineUsers.map(u => ({
            userId: u.id,
            status: u.status,
            lastSeenAt: u.lastSeenAt
        })));
    } catch (error) {
        console.error("Error sending online users list:", error);
    }

    socket.on('markMessagesAsRead', async (data) => {
        const {chatId, lastSeenMessageId} = data;
        const readerUserId = socket.userId;

        try {
            const chatMember = await ChatMember.findOne({where: {chatId, userId: readerUserId}});
            if (!chatMember) {
                return socket.emit('readError', {message: "You are not a member of this chat."});
            }

            // ۱. آپدیت lastReadMessageId در جدول ChatMember
            // اگر lastSeenMessageId داده شده، آن را ست کن. در غیر این صورت، آخرین پیام چت را بگیر و ست کن.
            let finalLastReadMessageId = lastSeenMessageId;
            if (!finalLastReadMessageId) {
                const lastMessageInChat = await Message.findOne({
                    where: {chatId},
                    order: [['createdAt', 'DESC']],
                    attributes: ['id']
                });
                if (lastMessageInChat) {
                    finalLastReadMessageId = lastMessageInChat.id;
                }
            }

            if (finalLastReadMessageId) {
                // فقط اگر پیام جدیدتری خوانده شده، آپدیت کن
                let updateNeeded = true;
                if (chatMember.lastReadMessageId) {
                    // مقایسه زمانی پیام ها برای اطمینان از اینکه پیام جدیدتری خوانده شده
                    // این بخش می تواند با مقایسه مستقیم ID ها (اگر UUID ها ترتیب زمانی داشته باشند) یا timestamp ها انجام شود
                    // برای سادگی، فعلا هر بار آپدیت می کنیم اگر finalLastReadMessageId معتبر باشد
                    // و متفاوت از قبلی باشد.
                    if (chatMember.lastReadMessageId === finalLastReadMessageId) updateNeeded = false;
                }

                if (updateNeeded) {
                    await chatMember.update({lastReadMessageId: finalLastReadMessageId});
                    console.log(`User ${readerUserId} marked messages as read in chat ${chatId} up to ${finalLastReadMessageId}`);
                }
            }


            // ۲. به کاربر(های) دیگر در چت اطلاع بده که پیام‌ها توسط این کاربر خوانده شده‌اند.
            // این اطلاعات برای نمایش "Read by X" یا تیک دوم آبی مفید است.
            const chat = await Chat.findByPk(chatId, {include: [{model: ChatMember, as: 'ChatMembersData'}]});
            if (chat) {
                chat.ChatMembersData.forEach(member => {
                    // به همه اعضای دیگر (به جز خود خواننده) اطلاع بده
                    if (member.userId !== readerUserId) {
                        io.to(member.userId).emit('messagesReadByRecipient', {
                            chatId: chatId,
                            readerId: readerUserId,
                            lastReadMessageId: finalLastReadMessageId // یا همه پیام های خوانده شده
                        });
                    }
                });
                // همچنین به خود خواننده هم یک تاییدیه بفرست (اختیاری)
                socket.emit('messagesSuccessfullyMarkedAsRead', {chatId, lastReadMessageId: finalLastReadMessageId});
            }

        } catch (error) {
            console.error('Error marking messages as read:', error);
            socket.emit('readError', {message: "Error processing read status."});
        }
    });


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
        console.log(`sendMessage event from socket ID: ${socket.id}, User ID: ${socket.userId}, Chat ID: ${data.chatId}, Content: ${data.content}`);
        try {
            const {chatId, content, tempId} = data;
            const senderId = socket.userId;

            // ۱. بررسی اینکه آیا کاربر عضو چت هست (برای امنیت بیشتر)
            const chatMember = await ChatMember.findOne({where: {chatId, userId: senderId}});
            if (!chatMember) {
                socket.emit('messageError', {tempId, message: "You are not a member of this chat."});
                return;
            }

            // ۲. ذخیره پیام در دیتابیس
            const message = await Message.create({
                chatId,
                senderId,
                content, // فعلا فقط متنی
                contentType: 'text',
            });
            await Chat.update({lastMessageId: message.id}, {where: {id: chatId}});

            const messageData = message.toJSON();


            // ۳. ارسال پیام به تمام اعضای چت (در روم مربوطه)
            io.to(chatId).emit('newMessage', {...messageData, tempId}); // ارسال tempId برای تطبیق در کلاینت

            // برای چت خصوصی:
            const chat = await Chat.findByPk(chatId, {
                include: [{model: ChatMember, as: 'ChatMembersData'}] // اطمینان از بارگذاری ChatMembers
            });
            if (chat && chat.type === 'private') {
                const otherMember = chat.ChatMembersData.find(cm => cm.userId !== senderId);
                if (otherMember) {
                    // بررسی اینکه آیا کاربر دیگر آنلاین است (یعنی سوکتی با userId او متصل است)
                    const recipientSockets = await io.in(otherMember.userId).fetchSockets();
                    if (recipientSockets.size > 0) {
                        // اگر گیرنده آنلاین است، رویداد delivered را به فرستنده اصلی بفرست
                        // فرستنده اصلی در روم شخصی خودش است
                        io.to(senderId).emit('messageStatusUpdate', {
                            messageId: message.id,
                            chatId: chatId,
                            status: 'delivered',
                            recipientId: otherMember.userId // برای اینکه فرستنده بداند برای کدام کاربر delivered شده
                        });
                        console.log(`Message ${message.id} delivered to user ${otherMember.userId}`);
                    } else {
                        // گیرنده آفلاین است، وضعیت delivered بعدا هنگام اتصال ارسال می شود یا در دیتابیس ذخیره می شود
                        console.log(`Recipient ${otherMember.userId} is offline. Message ${message.id} stored.`);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('messageError', {tempId: data.tempId, message: "Error sending message"});
        }
    });

    // رویداد برای نشانگر "در حال تایپ"
    socket.on('typing', (data) => {
        // data: { chatId: string, isTyping: boolean }
        const {chatId, isTyping} = data;
        // ارسال به همه کاربران در چت به جز خود فرستنده
        socket.to(chatId).emit('typing', {userId: socket.userId, chatId, isTyping});
    });


    socket.on('disconnect', async (reason) => {
        const disconnectedSocketId = socket.id; // ID سوکتی که قطع شده
        const disconnectedUserId = socket.userId; // UserId که به این سوکت associate شده بود

        console.log(`[Socket DISCONNECT] Socket ID: ${disconnectedSocketId}, UserID: ${disconnectedUserId}, Reason: ${reason}`);

        if (disconnectedUserId) {
            try {
                // تاخیر کوتاه برای اطمینان از اینکه همه رویدادهای مربوط به سوکت قبل از شمارش پردازش شده‌اند (اختیاری و برای دیباگ)
                // await new Promise(resolve => setTimeout(resolve, 100));

                // دریافت تمام سوکت‌های متصل به سرور
                const allConnectedSockets = await io.fetchSockets();

                // فیلتر کردن سوکت‌هایی که هنوز برای همین userId متصل هستند (به جز سوکت فعلی که در حال قطع شدن است)
                const remainingUserSockets = allConnectedSockets.filter(s => s.userId === disconnectedUserId && s.id !== disconnectedSocketId);

                console.log(`[Socket DISCONNECT] User ${disconnectedUserId} - Sockets remaining for this user: ${remainingUserSockets.length} (excluding the disconnecting one ${disconnectedSocketId})`);

                if (remainingUserSockets.length === 0) {
                    // این آخرین اتصال این کاربر بود
                    await User.update({ status: 'offline', lastSeenAt: new Date() }, { where: { id: disconnectedUserId } });

                    // ارسال رویداد به همه کلاینت‌های دیگر
                    // از io.emit استفاده می‌کنیم تا به همه (به جز این سوکت که دیگر وجود ندارد) ارسال شود
                    io.emit('userStatusChanged', {
                        userId: disconnectedUserId,
                        status: 'offline',
                        lastSeenAt: new Date()
                    });
                    console.log(`[Socket DISCONNECT] User ${disconnectedUserId} marked as OFFLINE and status broadcasted.`);
                } else {
                    console.log(`[Socket DISCONNECT] User ${disconnectedUserId} still has other active sockets. Not marking as offline.`);
                }
            } catch (error) {
                console.error(`[Socket DISCONNECT] Error updating user ${disconnectedUserId} status on disconnect:`, error);
            }
        } else {
            console.log(`[Socket DISCONNECT] Socket ${disconnectedSocketId} disconnected without a userId (was not fully authenticated or userId was cleared).`);
        }
    });
});


// همگام‌سازی پایگاه داده و راه‌اندازی سرور
const startServer = async () => {
    try {
        await sequelize.sync({alter: true});
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


