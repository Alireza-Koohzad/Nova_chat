// src/controllers/chatController.js
const { Op } = require('sequelize');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const ChatMember = require('../models/ChatMember');
const { sequelize } = require('../config/database'); // برای تراکنش‌ها

// Helper function to format chat response
const formatChatResponse = async (chat, currentUserId) => {
    const chatJSON = chat.toJSON();

    // اگر چت خصوصی است، نام و تصویر پروفایل کاربر دیگر را اضافه کن
    if (chatJSON.type === 'private' && chatJSON.members) {
        const otherMemberUser = chatJSON.members.find(m => m.id !== currentUserId);
        if (otherMemberUser) {
            chatJSON.name = otherMemberUser.displayName || otherMemberUser.username;
            chatJSON.profileImageUrl = otherMemberUser.profileImageUrl;
            chatJSON.recipientId = otherMemberUser.id; // اضافه کردن شناسه کاربر مقابل
        }
    } else if (chatJSON.type === 'group' && !chatJSON.name) {
        // اگر گروه نام ندارد، نامی بر اساس اعضا بساز (ساده شده)
        if (chatJSON.members && chatJSON.members.length > 0) {
            chatJSON.name = chatJSON.members.map(m => m.displayName || m.username).slice(0, 3).join(', ');
        } else {
            chatJSON.name = "Group Chat";
        }
    }

    // اضافه کردن آخرین پیام (اگر وجود دارد)
    if (chat.lastMessage) {
        chatJSON.lastMessage = chat.lastMessage.toJSON();
        if (chat.lastMessage.sender) {
            chatJSON.lastMessage.sender = chat.lastMessage.sender.toJSON(); // فقط اطلاعات ضروری
        }
    } else {
        // اگر lastMessageId ست شده ولی خود پیام لود نشده
        // این حالت نباید زیاد پیش بیاید اگر include درست باشد
        if (chat.lastMessageId) {
            const lastMsg = await Message.findByPk(chat.lastMessageId, { include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}] });
            if (lastMsg) {
                chatJSON.lastMessage = lastMsg.toJSON();
            }
        }
    }

    // حذف اطلاعات اضافی اعضا از پاسخ اصلی چت (اطلاعات کامل اعضا در یک endpoint دیگر یا با پارامتر قابل دریافت باشد)
    // delete chatJSON.members;
    // برای نمایش لیست چت ها، می توانیم اطلاعات اعضا را محدود کنیم
    if (chatJSON.members) {
        chatJSON.members = chatJSON.members.map(m => ({
            id: m.id,
            username: m.username,
            displayName: m.displayName,
            profileImageUrl: m.profileImageUrl,
            // role: m.ChatMember.role, // اگر اطلاعات ChatMember هم include شده باشد
        }));
    }


    return chatJSON;
};


// @desc    Get all chats for the logged-in user
// @route   GET /api/chats
// @access  Private
exports.getUserChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const chats = await Chat.findAll({
            include: [
                {
                    model: User,
                    as: 'members',
                    where: { id: userId }, // فقط چت‌هایی که کاربر عضو آنهاست
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'], // اطلاعات اعضا
                    through: { attributes: [] } // از آوردن اطلاعات جدول واسط ChatMember در اینجا خودداری کن
                },
                {
                    model: Message,
                    as: 'lastMessage', // آخرین پیام چت
                    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}]
                }
            ],
            order: [
                [{ model: Message, as: 'lastMessage' }, 'createdAt', 'DESC'], // مرتب‌سازی بر اساس آخرین پیام
                ['updatedAt', 'DESC'] // اگر آخرین پیام نداشت، بر اساس آپدیت چت
            ], // مرتب سازی بر اساس آخرین پیام
        });

        const formattedChats = await Promise.all(
            chats.map(chat => formatChatResponse(chat, userId))
        );

        res.json(formattedChats);

    } catch (error) {
        console.error('Error fetching user chats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Create or get a private chat with another user
// @route   POST /api/chats/private/:recipientId
// @access  Private
exports.createOrGetPrivateChat = async (req, res) => {
    const senderId = req.user.id;
    const { recipientId } = req.params;

    if (senderId === recipientId) {
        return res.status(400).json({ success: false, message: "Cannot create a chat with yourself." });
    }

    try {
        const recipient = await User.findByPk(recipientId);
        if (!recipient) {
            return res.status(404).json({ success: false, message: 'Recipient user not found.' });
        }

        // پیدا کردن چت خصوصی موجود بین دو کاربر
        // این کوئری پیچیده است چون باید مطمئن شویم دقیقا همین دو نفر عضو هستند و نه بیشتر یا کمتر
        const existingChat = await Chat.findOne({
            where: {
                type: 'private',
            },
            include: [{
                model: ChatMember,
                as: 'ChatMembers', // این as باید با چیزی که در Chat.belongsToMany(User, { through: ChatMember ... }) تعریف شده متفاوت باشد یا مستقیم از ChatMember استفاده کنیم
                                   // برای سادگی، مستقیما از ChatMember استفاده می‌کنیم
                required: true,
                attributes: [] // ما فقط به وجود رکوردها نیاز داریم
            }],
            // اینجا یک GROUP BY و HAVING برای اطمینان از اینکه دقیقا دو عضو مشخص شده وجود دارند، نیاز است
            // Sequelize این را کمی سخت می‌کند. یک راه ساده‌تر:
            // ۱. تمام چت‌های خصوصی فرستنده را بگیر.
            // ۲. در بین آنها، چتی را پیدا کن که گیرنده هم عضو آن باشد و فقط همین دو نفر عضو باشند.
            // یک راه حل دقیق‌تر:
            // استفاده از subquery یا join پیچیده‌تر
        });

        // راه حل ساده تر (ولی ممکن است برای دیتابیس های خیلی بزرگ بهینه نباشد):
        const userChats = await Chat.findAll({
            where: { type: 'private' },
            include: [
                {
                    model: User,
                    as: 'members',
                    attributes: ['id'],
                    through: { attributes: [] }
                }
            ]
        });

        let foundChat = null;
        for (const chat of userChats) {
            const memberIds = chat.members.map(m => m.id);
            if (memberIds.length === 2 && memberIds.includes(senderId) && memberIds.includes(recipientId)) {
                foundChat = chat;
                break;
            }
        }


        if (foundChat) {
            // اگر چت موجود بود، اطلاعات کامل آن را برگردان
            const detailedChat = await Chat.findByPk(foundChat.id, {
                include: [
                    { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'] },
                    { model: Message, as: 'lastMessage', include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}] }
                ]
            });
            return res.json(await formatChatResponse(detailedChat, senderId));
        }

        // اگر چت موجود نبود، یکی جدید ایجاد کن (در یک تراکنش)
        const t = await sequelize.transaction();
        try {
            const newChat = await Chat.create({ type: 'private' }, { transaction: t });
            await ChatMember.bulkCreate([
                { chatId: newChat.id, userId: senderId },
                { chatId: newChat.id, userId: recipientId },
            ], { transaction: t });

            await t.commit();

            // اطلاعات کامل چت جدید را برگردان
            const detailedNewChat = await Chat.findByPk(newChat.id, {
                include: [
                    { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'] },
                    // در ابتدا lastMessage وجود ندارد
                ]
            });
            return res.status(201).json(await formatChatResponse(detailedNewChat, senderId));

        } catch (error) {
            await t.rollback();
            console.error('Error creating private chat:', error);
            throw error; // باعث می‌شود به catch بیرونی برود
        }

    } catch (error) {
        console.error('Error in createOrGetPrivateChat:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get messages for a specific chat
// @route   GET /api/chats/:chatId/messages
// @access  Private
exports.getChatMessages = async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        // ۱. بررسی اینکه کاربر عضو چت است
        const chatMember = await ChatMember.findOne({ where: { chatId, userId } });
        if (!chatMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this chat." });
        }

        const messages = await Message.findAll({
            where: { chatId },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                },
            ],
            order: [['createdAt', 'DESC']], // جدیدترین پیام‌ها اول
            limit,
            offset,
        });

        // پیام‌ها را برعکس کن تا به ترتیب زمانی درست (قدیمی به جدید) برای نمایش در کلاینت باشند
        res.json(messages.reverse());

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// توابع برای گروه ها در فاز بعدی ...