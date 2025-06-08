
// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const {Server} = require('socket.io');
const {connectDB, sequelize} = require('./config/database');
const setupSwagger = require('./config/swagger');
const {Op} = require('sequelize');

// Import مدل‌ها
const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const ChatMember = require('./models/ChatMember');
const defineAssociations = require('./models/Associations');

// Import روت‌ها
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // TODO: Restrict in production
        methods: ["GET", "POST"]
    }
});
// Export io so it can be used in controllers
module.exports = { io };


const PORT = process.env.PORT || 3000;

defineAssociations();
connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

setupSwagger(app);

app.get('/', (req, res) => {
    res.send('NovaChat API (Express.js with Socket.IO) is running!');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({success: false, message: 'Something broke!', error: err.message});
});

const {verifySocketToken} = require('./middleware/socketAuthMiddleware');
io.use(verifySocketToken);


io.on('connection', async (socket) => {
    console.log(`[Socket CONNECT Start] User connected: ${socket.id}, UserID: ${socket.userId}, Username: ${socket.user?.username}`);

    socket.join(socket.userId); // User's personal room

    try {
        await User.update({status: 'online', lastSeenAt: new Date()}, {where: {id: socket.userId}});
        const onlineStatusData = {userId: socket.userId, status: 'online', lastSeenAt: new Date()};
        io.emit('userStatusChanged', onlineStatusData);
        console.log(`[Socket Status Connect] UserID: ${socket.userId}. Marked ONLINE in DB. Broadcasted 'userStatusChanged'. Data:`, onlineStatusData);
    } catch (error) {
        console.error(`[Socket Status Connect Error] UserID: ${socket.userId}. Error updating status to online:`, error);
    }

    try {
        const onlineUsers = await User.findAll({
            where: { status: 'online', id: { [Op.ne]: socket.userId } },
            attributes: ['id', 'status', 'lastSeenAt']
        });
        const onlineUsersPayload = onlineUsers.map(u => ({
            userId: u.id,
            status: u.status,
            lastSeenAt: u.lastSeenAt
        }));
        socket.emit('currentOnlineUsers', onlineUsersPayload);
        console.log(`[Socket Connect] UserID: ${socket.userId}. Emitted 'currentOnlineUsers' to self. Count: ${onlineUsersPayload.length}`);
    } catch (error) {
        console.error(`[Socket Connect Error] UserID: ${socket.userId}. Error sending 'currentOnlineUsers':`, error);
    }
    console.log(`[Socket CONNECT End] Finished connection setup for UserID: ${socket.userId}, SocketID: ${socket.id}`);


    socket.on('markMessagesAsRead', async (data) => {
        const {chatId, lastSeenMessageId} = data;
        const readerUserId = socket.userId;
        console.log(`[Socket MarkRead] User ${readerUserId} marking messages in chat ${chatId} up to ${lastSeenMessageId || 'last message'}`);

        try {
            const chatMember = await ChatMember.findOne({where: {chatId, userId: readerUserId}});
            if (!chatMember) {
                return socket.emit('readError', {chatId, message: "You are not a member of this chat."});
            }

            let finalLastReadMessageId = lastSeenMessageId;
            if (!finalLastReadMessageId) {
                const lastMessageInChat = await Message.findOne({
                    where: {chatId}, order: [['createdAt', 'DESC']], attributes: ['id']
                });
                if (lastMessageInChat) finalLastReadMessageId = lastMessageInChat.id;
            }

            if (finalLastReadMessageId) {
                let updateNeeded = true;
                if (chatMember.lastReadMessageId) {
                    const currentLastReadMsg = await Message.findByPk(chatMember.lastReadMessageId, { attributes: ['createdAt'] });
                    const newLastReadMsg = await Message.findByPk(finalLastReadMessageId, { attributes: ['createdAt'] });
                    if (currentLastReadMsg && newLastReadMsg && new Date(newLastReadMsg.createdAt) <= new Date(currentLastReadMsg.createdAt)) {
                        updateNeeded = false;
                    }
                }

                if (updateNeeded) {
                    await chatMember.update({lastReadMessageId: finalLastReadMessageId});
                    console.log(`[Socket MarkRead SUCCESS] User ${readerUserId} lastReadMessageId updated for chat ${chatId} to ${finalLastReadMessageId}`);

                    // Update deliveryStatus of messages sent by OTHERS to 'read'
                    const messagesToUpdate = await Message.findAll({
                        where: {
                            chatId: chatId,
                            senderId: { [Op.ne]: readerUserId },
                            id: { [Op.lte]: finalLastReadMessageId },
                            deliveryStatus: { [Op.ne]: 'read' }
                        }
                    });

                    for (const msg of messagesToUpdate) {
                        await msg.update({ deliveryStatus: 'read' });
                        if (msg.senderId) { // Notify the original sender
                            io.to(msg.senderId).emit('messageStatusUpdate', {
                                messageId: msg.id,
                                chatId: chatId,
                                status: 'read',
                                readerId: readerUserId
                            });
                            console.log(`[Socket MsgStatus] Message ${msg.id} (sent by ${msg.senderId}) marked as READ by ${readerUserId}. Notified sender.`);
                        }
                    }
                } else {
                    console.log(`[Socket MarkRead SKIPPED] User ${readerUserId} already has a more recent or same lastReadMessageId for chat ${chatId}.`);
                }
            }

            const chat = await Chat.findByPk(chatId, {include: [{model: ChatMember, as: 'ChatMembersData'}]});
            if (chat) {
                chat.ChatMembersData.forEach(member => {
                    if (member.userId !== readerUserId) {
                        io.to(member.userId).emit('messagesReadByRecipient', {
                            chatId: chatId,
                            readerId: readerUserId,
                            lastReadMessageId: finalLastReadMessageId
                        });
                    }
                });
                socket.emit('messagesSuccessfullyMarkedAsRead', {chatId, lastReadMessageId: finalLastReadMessageId});
            }
        } catch (error) {
            console.error(`[Socket MarkRead Error] User ${readerUserId}, Chat ${chatId}:`, error);
            socket.emit('readError', {chatId, message: "Error processing read status."});
        }
    });

    socket.on('joinChat', (chatId) => {
        socket.join(chatId);
        console.log(`[Socket JoinChat] User ${socket.userId} (socket ${socket.id}) joined chat room ${chatId}`);
    });

    socket.on('leaveChat', (chatId) => {
        socket.leave(chatId);
        console.log(`[Socket LeaveChat] User ${socket.userId} (socket ${socket.id}) left chat room ${chatId}`);
    });

    socket.on('sendMessage', async (data) => {
        console.log(`[Socket SendMessage] From: ${socket.userId}, ChatID: ${data.chatId}, Content: ${data.content.substring(0,30)}...`);
        try {
            const {chatId, content, tempId} = data;
            const senderId = socket.userId;

            const chatMember = await ChatMember.findOne({where: {chatId, userId: senderId}});
            if (!chatMember) {
                socket.emit('messageError', {tempId, message: "You are not a member of this chat."});
                return;
            }
            const message = await Message.create({ chatId, senderId, content, contentType: 'text' });
            await Chat.update({lastMessageId: message.id, updatedAt: new Date()}, {where: {id: chatId}});

            let finalMessageData = message.toJSON();

            const chat = await Chat.findByPk(chatId, { include: [{ model: ChatMember, as: 'ChatMembersData' }] });

            if (chat && chat.type === 'private') {
                const otherMember = chat.ChatMembersData.find(cm => cm.userId !== senderId);
                if (otherMember) {
                    const recipientSockets = await io.in(otherMember.userId).fetchSockets();
                    if (recipientSockets.length > 0) {
                        await message.update({ deliveryStatus: 'delivered' });
                        finalMessageData.deliveryStatus = 'delivered';
                        io.to(senderId).emit('messageStatusUpdate', {
                            messageId: message.id,
                            chatId: chatId,
                            status: 'delivered',
                            recipientId: otherMember.userId
                        });
                        console.log(`[Socket MsgStatus] Message ${message.id} DELIVERED to user ${otherMember.userId} and DB updated.`);
                    } else {
                        console.log(`[Socket MsgStatus] Recipient ${otherMember.userId} OFFLINE for message ${message.id}. Status remains 'sent'.`);
                    }
                }
            } else if (chat && chat.type === 'group') {
                const activeRecipientMembers = chat.ChatMembersData.filter(cm => cm.userId !== senderId);
                let deliveredToAnyInGroup = false;
                for (const member of activeRecipientMembers) {
                    const recipientSockets = await io.in(member.userId).fetchSockets();
                    if (recipientSockets.length > 0) {
                        deliveredToAnyInGroup = true;
                        break;
                    }
                }
                if (deliveredToAnyInGroup) {
                    await message.update({ deliveryStatus: 'delivered' });
                    finalMessageData.deliveryStatus = 'delivered';
                    io.to(senderId).emit('messageStatusUpdate', {
                        messageId: message.id,
                        chatId: chatId,
                        status: 'delivered',
                    });
                    console.log(`[Socket MsgStatus] Group Message ${message.id} marked DELIVERED (at least one recipient active) and DB updated.`);
                } else {
                    console.log(`[Socket MsgStatus] Group Message ${message.id} status remains 'sent' (no active recipients found).`);
                }
            }

            const messageFull = await Message.findByPk(message.id, {
                include: [{model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'profileImageUrl']}]
            });
            const messageDataForClient = { ...messageFull.toJSON(), ...finalMessageData, tempId };

            io.to(chatId).emit('newMessage', messageDataForClient);
            console.log(`[Socket NewMessage] Emitted to room ${chatId}, MsgID: ${message.id}, Status: ${messageDataForClient.deliveryStatus}`);

        } catch (error) {
            console.error('[Socket SendMessage Error]:', error);
            socket.emit('messageError', {tempId: data.tempId, message: "Error sending message"});
        }
    });

    socket.on('typing', (data) => {
        const {chatId, isTyping} = data;
        socket.to(chatId).emit('typing', {userId: socket.userId, username: socket.user.username, chatId, isTyping});
    });


    socket.on('disconnect', async (reason) => {
        const disconnectedSocketId = socket.id;
        const disconnectedUserId = socket.userId;
        const disconnectedUsername = socket.user?.username;

        console.log(`[Socket DISCONNECT Start] SocketID: ${disconnectedSocketId}, UserID: ${disconnectedUserId}, Username: ${disconnectedUsername}, Reason: ${reason}`);

        if (!disconnectedUserId) {
            console.log(`[Socket DISCONNECT End] No UserID for socket ${disconnectedSocketId}. No status update.`);
            return;
        }

        // Use a timeout to allow Socket.IO to fully process the disconnection and room leave.
        // This makes the subsequent check for remaining sockets more reliable.
        setTimeout(async () => {
            try {
                const roomSockets = io.sockets.adapter.rooms.get(disconnectedUserId);
                const remainingSocketCount = roomSockets ? roomSockets.size : 0;

                console.log(`[Socket DISCONNECT Check - Delayed] UserID: ${disconnectedUserId}. Sockets in room '${disconnectedUserId}': ${remainingSocketCount}.`);

                if (remainingSocketCount === 0) {
                    console.log(`[Socket DISCONNECT UpdateDB] UserID: ${disconnectedUserId}. Attempting to mark as offline as no other sockets found.`);
                    const [affectedRows] = await User.update({ status: 'offline', lastSeenAt: new Date() }, { where: { id: disconnectedUserId } });

                    if (affectedRows > 0) {
                        console.log(`[Socket DISCONNECT UpdateDB Success] UserID: ${disconnectedUserId}. Marked as offline in DB.`);
                    } else {
                        console.log(`[Socket DISCONNECT UpdateDB NoChangeOrNotFound] UserID: ${disconnectedUserId}. User already offline or not found for update.`);
                    }

                    const offlineStatusData = {
                        userId: disconnectedUserId,
                        status: 'offline',
                        lastSeenAt: new Date()
                    };
                    io.emit('userStatusChanged', offlineStatusData);
                    console.log(`[Socket DISCONNECT Broadcast] UserID: ${disconnectedUserId}. Broadcasted 'userStatusChanged' as offline. Data:`, offlineStatusData);
                } else {
                    console.log(`[Socket DISCONNECT SkipOffline] UserID: ${disconnectedUserId}. User still has ${remainingSocketCount} active socket(s). Not marking as offline.`);
                }
            } catch (error) {
                console.error(`[Socket DISCONNECT Error - Delayed] UserID: ${disconnectedUserId}. Error during disconnect logic:`, error);
            }
            console.log(`[Socket DISCONNECT End - Delayed] Finished processing for UserID: ${disconnectedUserId}, SocketID: ${disconnectedSocketId}.`);
        }, 500); // Delay of 500ms
    });
});


const startServer = async () => {
    try {
        // The 'alter: true' should only be used in development.
        // For production, use migrations.
        // Ensure NODE_ENV is set correctly in your environment.
        await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
        console.log('Database synchronized successfully.');

        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`API docs available at http://localhost:${PORT}/api-docs`);
        });
    } catch (error) {
        console.error('Failed to sync database or start server:', error);
        process.exit(1);
    }
};

startServer();
