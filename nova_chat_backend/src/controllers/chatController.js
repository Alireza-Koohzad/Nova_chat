// src/controllers/chatController.js
const {Op} = require('sequelize');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const ChatMember = require('../models/ChatMember');
const {sequelize} = require('../config/database'); // برای تراکنش‌ها
const { validationResult } = require('express-validator');

// Helper function to format chat response
const formatChatResponse = async (chat, currentUserId) => {
    if (!chat) return null; // اگر چت null بود
    const chatJSON = chat.toJSON ? chat.toJSON() : { ...chat }; // اگر از plain object استفاده شده

    // اعضا (شامل نقش اگر موجود است)
    if (chatJSON.members && chatJSON.members.length > 0) {
        chatJSON.members = chatJSON.members.map(member => ({
            id: member.id,
            username: member.username,
            displayName: member.displayName,
            profileImageUrl: member.profileImageUrl,
            // ChatMember شامل اطلاعات نقش است که از through در include می آید
            role: member.ChatMember?.role || (member.id === chatJSON.creatorId ? 'admin' : 'member')
        }));
    }

    if (chatJSON.type === 'private') {
        const otherMemberUser = chatJSON.members?.find(m => m.id !== currentUserId);
        if (otherMemberUser) {
            chatJSON.name = otherMemberUser.displayName || otherMemberUser.username; // نام چت خصوصی، نام کاربر دیگر
            chatJSON.profileImageUrl = otherMemberUser.profileImageUrl; // تصویر کاربر دیگر
            chatJSON.recipientId = otherMemberUser.id;
        } else if (!chatJSON.name) {
            chatJSON.name = "Private Chat"; // اگر به دلایلی کاربر دیگر پیدا نشد
        }
    } else if (chatJSON.type === 'group') {
        // نام گروه از خود فیلد chat.name می آید
        // chatJSON.groupImageUrl = chat.groupImageUrl; // اگر تصویر گروه دارید
    }

    // اضافه کردن آخرین پیام (اگر وجود دارد)
    if (chat.lastMessage) { // اگر lastMessage به صورت eager load شده باشد
        chatJSON.lastMessage = chat.lastMessage.toJSON ? chat.lastMessage.toJSON() : { ...chat.lastMessage };
        if (chat.lastMessage.sender) { // اگر فرستنده هم eager load شده
            chatJSON.lastMessage.sender = chat.lastMessage.sender.toJSON ? chat.lastMessage.sender.toJSON() : { ...chat.lastMessage.sender };
        }
    } else if (chat.lastMessageId && !chatJSON.lastMessage) {
        // اگر فقط ID آخرین پیام را داریم و خود پیام لود نشده، آن را fetch کن (اختیاری)
        const lastMsg = await Message.findByPk(chat.lastMessageId, {
            include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}]
        });
        if (lastMsg) {
            chatJSON.lastMessage = lastMsg.toJSON();
        }
    }

    // محاسبه تعداد پیام‌های خوانده نشده برای currentUserId
    // این بخش را می‌توان دقیق‌تر کرد
    if (chatJSON.id && currentUserId) {
        const currentUserMembership = await ChatMember.findOne({
            where: { chatId: chatJSON.id, userId: currentUserId },
            attributes: ['lastReadMessageId']
        });
        if (currentUserMembership && chatJSON.lastMessage?.id && currentUserMembership.lastReadMessageId !== chatJSON.lastMessage.id) {
            // شمارش پیام های جدیدتر از lastReadMessageId
            const unreadCount = await Message.count({
                where: {
                    chatId: chatJSON.id,
                    id: { [Op.ne]: chatJSON.lastMessage.id }, // به جز خود آخرین پیام (اگر این منطق را می خواهید)
                    createdAt: {
                        [Op.gt]: (await Message.findByPk(currentUserMembership.lastReadMessageId || '00000000-0000-0000-0000-000000000000', {attributes: ['createdAt']}))?.createdAt || new Date(0)
                    }
                }
            });
            chatJSON.unreadCount = unreadCount;
        } else {
            chatJSON.unreadCount = 0;
        }
    } else {
        chatJSON.unreadCount = 0;
    }

    return chatJSON;
};


// @desc    Get all chats for the logged-in user
// @route   GET /api/chats
// @access  Private
exports.getUserChats = async (req, res) => {
    try {
        const userId = req.user.id;
        // ابتدا ID چت‌هایی که کاربر عضو آنهاست را پیدا کن
        const userChatMemberships = await ChatMember.findAll({
            where: { userId },
            attributes: ['chatId']
        });
        const chatIds = userChatMemberships.map(cm => cm.chatId);

        if (chatIds.length === 0) {
            return res.json([]); // اگر کاربر عضوی از هیچ چتی نیست
        }

        const chats = await Chat.findAll({
            where: { id: { [Op.in]: chatIds } }, // فقط چت‌های مربوط به کاربر
            include: [
                {
                    model: User,
                    as: 'members', // اعضای هر چت
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                    through: {
                        model: ChatMember, // برای دسترسی به فیلدهای جدول واسط
                        attributes: ['role'] // فقط نقش را از جدول واسط می‌خواهیم
                    }
                },
                {
                    model: Message,
                    as: 'lastMessage', // آخرین پیام چت
                    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}]
                },
                {
                    model: User, // ایجاد کننده گروه
                    as: 'creator',
                    attributes: ['id', 'username', 'displayName']
                }
            ],
            order: [
                ['updatedAt', 'DESC'] // ساده ترین راه اگر updatedAt چت با هر پیام آپدیت شود
            ],
        });

        const formattedChats = await Promise.all(
            chats.map(chat => formatChatResponse(chat, userId))
        );

        // مرتب سازی نهایی در سمت سرور پس از فرمت کردن (اگر لازم است)
        formattedChats.sort((a, b) => {
            const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt);
            const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt);
            return dateB - dateA;
        });

        res.json(formattedChats);

    } catch (error) {
        console.error('Error fetching user chats:', error);
        res.status(500).json({ success: false, message: 'Server error fetching chats' });
    }
};

// @desc    Create or get a private chat with another user
// @route   POST /api/chats/private/:recipientId
// @access  Private
exports.createOrGetPrivateChat = async (req, res) => {
    const senderId = req.user.id;
    const {recipientId} = req.params;

    if (senderId === recipientId) {
        return res.status(400).json({success: false, message: "Cannot create a chat with yourself."});
    }

    try {
        const recipient = await User.findByPk(recipientId);
        if (!recipient) {
            return res.status(404).json({success: false, message: 'Recipient user not found.'});
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

        });

        // راه حل ساده تر (ولی ممکن است برای دیتابیس های خیلی بزرگ بهینه نباشد):
        const userChats = await Chat.findAll({
            where: {type: 'private'},
            include: [
                {
                    model: User,
                    as: 'members',
                    attributes: ['id'],
                    through: {attributes: []}
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
                    {model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl']},
                    {
                        model: Message,
                        as: 'lastMessage',
                        include: [{model: User, as: 'sender', attributes: ['id', 'username', 'displayName']}]
                    }
                ]
            });
            return res.json(await formatChatResponse(detailedChat, senderId));
        }

        // اگر چت موجود نبود، یکی جدید ایجاد کن (در یک تراکنش)
        const t = await sequelize.transaction();
        try {
            const newChat = await Chat.create({type: 'private'}, {transaction: t});
            await ChatMember.bulkCreate([
                {chatId: newChat.id, userId: senderId},
                {chatId: newChat.id, userId: recipientId},
            ], {transaction: t});

            await t.commit();

            // اطلاعات کامل چت جدید را برگردان
            const detailedNewChat = await Chat.findByPk(newChat.id, {
                include: [
                    {model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl']},
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
        res.status(500).json({success: false, message: 'Server error'});
    }
};

// @desc    Get messages for a specific chat
// @route   GET /api/chats/:chatId/messages
// @access  Private
exports.getChatMessages = async (req, res) => {
    const {chatId} = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        // ۱. بررسی اینکه کاربر عضو چت است
        const chatMember = await ChatMember.findOne({where: {chatId, userId}});
        if (!chatMember) {
            return res.status(403).json({success: false, message: "You are not a member of this chat."});
        }

        const messages = await Message.findAll({
            where: {chatId},
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
        res.status(500).json({success: false, message: 'Server error'});
    }
};

const createSystemMessage = async (chatId, content, transaction = null) => {
    return Message.create({
        chatId,
        content,
        contentType: 'system',
        // senderId برای پیام سیستمی می‌تواند null باشد
    }, { transaction });
};


// @desc    Create a new group chat
// @route   POST /api/chats/groups
// @access  Private
exports.createGroupChat = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, memberIds } = req.body; // name: نام گروه, memberIds: آرایه‌ای از ID کاربران برای اضافه شدن به گروه
    const creatorId = req.user.id;

    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Group name is required.' });
    }

    // مطمئن شو creatorId در memberIds نیست (یا اگر هست، فقط یکبار و با نقش ادمین اضافه شود)
    // و حداقل یک عضو دیگر به جز ایجادکننده وجود داشته باشد (یا اینکه گروه تک نفره مجاز باشد؟)
    // فعلا فرض می کنیم ایجاد کننده هم باید در memberIds باشد یا خودمان اضافه اش می کنیم.

    const finalMemberIds = [...new Set([creatorId, ...(memberIds || [])])]; // اطمینان از وجود ایجادکننده و عدم تکرار

    if (finalMemberIds.length < 2) { // معمولا گروه حداقل دو نفر است، اما بسته به نیاز شما
        // return res.status(400).json({ success: false, message: 'A group must have at least one other member besides the creator.' });
    }

    const t = await sequelize.transaction();
    try {
        // ۱. ایجاد چت از نوع گروه
        const newGroup = await Chat.create({
            type: 'group',
            name,
            creatorId,
        }, { transaction: t });

        // ۲. اضافه کردن اعضا به گروه
        const chatMembersData = finalMemberIds.map(userId => ({
            chatId: newGroup.id,
            userId,
            role: userId === creatorId ? 'admin' : 'member', // ایجادکننده، ادمین است
        }));
        await ChatMember.bulkCreate(chatMembersData, { transaction: t });

        // ۳. (اختیاری) ایجاد یک پیام سیستمی "گروه ایجاد شد"
        const creatorUser = await User.findByPk(creatorId, { attributes: ['displayName', 'username']});
        const creatorName = creatorUser.displayName || creatorUser.username;
        await createSystemMessage(newGroup.id, `${creatorName} created the group "${name}"`, t);
        // شما می توانید آخرین پیام گروه را هم با این پیام سیستمی آپدیت کنید.
        // یا بگذارید اولین پیام واقعی کاربران، lastMessageId را آپدیت کند.

        await t.commit();

        // برگرداندن اطلاعات کامل گروه جدید (شامل اعضا)
        const groupDetails = await Chat.findByPk(newGroup.id, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username', 'displayName'] },
                {
                    model: User,
                    as: 'members',
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                    through: { attributes: ['role'] } // برای گرفتن نقش از جدول ChatMember
                },
                // { model: Message, as: 'lastMessage' } // اگر پیام سیستمی را به عنوان آخرین پیام ست کردید
            ]
        });

        // TODO: به اعضای گروه از طریق سوکت اطلاع بده که به گروه جدید اضافه شده‌اند
        // io.to(memberId1).emit('newChat', groupDetails);
        // io.to(memberId2).emit('newChat', groupDetails); ...

        res.status(201).json(await formatChatResponse(groupDetails, creatorId)); // از تابع formatChatResponse قبلی استفاده می‌کنیم

    } catch (error) {
        await t.rollback();
        console.error('Error creating group chat:', error);
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ success: false, message: 'One or more member IDs are invalid.' });
        }
        res.status(500).json({ success: false, message: 'Server error while creating group.' });
    }
};
