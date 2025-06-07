// src/controllers/chatController.js
const {Op} = require('sequelize');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const ChatMember = require('../models/ChatMember');
const {sequelize} = require('../config/database'); // برای تراکنش‌ها
const { validationResult } = require('express-validator');
const { io } = require('../server');


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
                as: 'ChatMembersData', // این as باید با چیزی که در Chat.belongsToMany(User, { through: ChatMember ... }) تعریف شده متفاوت باشد یا مستقیم از ChatMember استفاده کنیم
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
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 30; // افزایش limit پیش‌فرض
    const offset = parseInt(req.query.offset) || 0;

    try {
        const chatMember = await ChatMember.findOne({ where: { chatId, userId: currentUserId } });
        if (!chatMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this chat." });
        }

        const chat = await Chat.findByPk(chatId, {
            include: [{ // برای دسترسی به اعضا و نوع چت
                model: User,
                as: 'members',
                attributes: ['id'], // فقط ID لازم است
                through: { model: ChatMember, attributes: ['userId', 'lastReadMessageId', 'role'] }
            }]
        });

        if (!chat) {
            return res.status(404).json({ success: false, message: "Chat not found." });
        }

        const messagesFromDB = await Message.findAll({
            where: { chatId },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                },
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });

        // پردازش پیام‌ها برای اضافه کردن وضعیت delivery/read
        const processedMessages = await Promise.all(messagesFromDB.map(async (msg) => {
            const message = msg.toJSON(); // تبدیل به آبجکت ساده
            message.deliveryStatus = 'sent'; // پیش فرض برای پیام های قدیمی که از طریق سوکت وضعیت نگرفته اند
            message.readByRecipient = false;

            if (message.senderId === currentUserId) { // اگر پیام ارسالی توسط کاربر فعلی است
                if (chat.type === 'private') {
                    const otherMemberInfo = chat.members.find(m => m.id !== currentUserId)?.ChatMember;
                    if (otherMemberInfo && otherMemberInfo.lastReadMessageId) {
                        // آیا پیام فعلی یا پیام‌های قدیمی‌تر از آن، توسط کاربر دیگر خوانده شده؟
                        // این مقایسه با ID ممکن است دقیق نباشد اگر ID ها ترتیب زمانی ندارند
                        // بهتر است با createdAt مقایسه شود یا یک کوئری برای شمارش پیام های خوانده نشده زده شود
                        // ساده سازی: اگر ID پیام فعلی، آخرین پیام خوانده شده توسط دیگری است یا قبل از آن
                        const lastReadByOther = await Message.findByPk(otherMemberInfo.lastReadMessageId, { attributes: ['createdAt'] });
                        if (lastReadByOther && new Date(message.createdAt) <= new Date(lastReadByOther.createdAt)) {
                            message.deliveryStatus = 'read';
                            message.readByRecipient = true;
                        } else {
                            // برای delivered: اگر بخواهیم ذخیره کنیم، باید مکانیزم داشته باشیم
                            // فعلا اگر read نشده، sent در نظر می گیریم برای تاریخچه
                            // یا اگر بخواهیم delivered را هم در نظر بگیریم، باید یک فیلد جدا در Message یا جدول MessageReceipts داشته باشیم
                            message.deliveryStatus = 'delivered'; // فرض می کنیم اگر خوانده نشده، حداقل تحویل داده شده (این فرض ممکن است همیشه درست نباشد)
                        }
                    } else {
                        message.deliveryStatus = 'sent'; // اگر اطلاعات خوانده شدن کاربر دیگر موجود نیست
                    }
                } else if (chat.type === 'group') {
                    // برای گروه، وضعیت read پیچیده است.
                    // می توان بررسی کرد آیا *حداقل یک* عضو دیگر آن را خوانده یا *همه* خوانده اند.
                    // ساده سازی: فعلا برای گروه، پیام های ارسالی خودمان را 'delivered' در نظر می گیریم (اگر بخواهیم از 'sent' متفاوت باشد)
                    // یا اگر می خواهیم دقیق تر باشیم، ببینیم آخرین پیام خوانده شده توسط *هر* عضو دیگر چیست
                    let someoneElseReadIt = false;
                    for (const member of chat.members) {
                        if (member.id !== currentUserId && member.ChatMember?.lastReadMessageId) {
                            const lastReadByThisMember = await Message.findByPk(member.ChatMember.lastReadMessageId, { attributes: ['createdAt'] });
                            if (lastReadByThisMember && new Date(message.createdAt) <= new Date(lastReadByThisMember.createdAt)) {
                                someoneElseReadIt = true;
                                break;
                            }
                        }
                    }
                    if (someoneElseReadIt) {
                        message.deliveryStatus = 'read'; // یا یک وضعیت خاص مثل 'readBySome'
                        message.readByRecipient = true; // به معنی اینکه حداقل یک نفر خوانده
                    } else {
                        message.deliveryStatus = 'delivered'; // فرض بر اینکه به گروه تحویل داده شده
                    }
                }
            }
            return message;
        }));

        res.json(processedMessages.reverse()); // برگرداندن به ترتیب زمانی صحیح (قدیمی به جدید)

    } catch (error) {
        console.error('Error fetching messages with status:', error);
        res.status(500).json({ success: false, message: 'Server error fetching messages' });
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


// @desc    Add a member to a group chat (by admin)
// @route   POST /api/chats/:chatId/members
// @access  Private (Admin Only)
exports.addMemberToGroup = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { chatId } = req.params;
    const { userId: userIdToAdd } = req.body; // کاربری که باید اضافه شود
    const adminUser = req.user; // ادمینی که درخواست را داده (از protect و ensureGroupAdmin)

    if (!userIdToAdd) {
        return res.status(400).json({ success: false, message: 'User ID to add is required.' });
    }

    if (userIdToAdd === adminUser.id) {
        return res.status(400).json({ success: false, message: 'Admin is already a member.' });
    }

    const t = await sequelize.transaction();
    try {
        // req.chat از میان‌افزار ensureGroupAdmin می‌آید
        const chat = req.chat;

        // بررسی اینکه آیا کاربر جدید یک کاربر معتبر است
        const userToAdInstance = await User.findByPk(userIdToAdd);
        if (!userToAdInstance) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User to add not found.' });
        }

        // بررسی اینکه آیا کاربر از قبل عضو گروه است
        const existingMembership = await ChatMember.findOne({
            where: { chatId, userId: userIdToAdd },
            transaction: t // برای اطمینان از خواندن در همان تراکنش
        });

        if (existingMembership) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'User is already a member of this group.' });
        }

        // اضافه کردن کاربر به عنوان عضو جدید
        const newMember = await ChatMember.create({
            chatId,
            userId: userIdToAdd,
            role: 'member', // به طور پیش‌فرض، عضو جدید نقش 'member' دارد
        }, { transaction: t });

        // ایجاد پیام سیستمی
        const adminName = adminUser.displayName || adminUser.username;
        const newMemberName = userToAdInstance.displayName || userToAdInstance.username;
        const systemMessageContent = `${adminName} added ${newMemberName} to the group.`;
        const systemMessage = await createSystemMessage(chatId, systemMessageContent, t);

        // آپدیت lastMessageId و updatedAt برای چت
        await chat.update({ lastMessageId: systemMessage.id, updatedAt: new Date() }, { transaction: t });

        await t.commit();

        // برگرداندن اطلاعات عضو جدید (یا کل گروه آپدیت شده)
        // برای سادگی، فقط پیام موفقیت‌آمیز برمی‌گردانیم. کلاینت می‌تواند لیست اعضا را دوباره fetch کند.
        // یا می‌توانید اطلاعات عضو جدید را برگردانید:
        const addedMemberDetails = {
            userId: newMember.userId,
            username: userToAdInstance.username,
            displayName: userToAdInstance.displayName,
            profileImageUrl: userToAdInstance.profileImageUrl,
            role: newMember.role,
            joinedAt: newMember.joinedAt
        };

        // TODO: به کاربر جدید و سایر اعضای گروه از طریق سوکت اطلاع بده
        // io.to(userIdToAdd).emit('addedToGroup', await formatChatResponse(chat, userIdToAdd)); // به کاربر جدید
        // chat.members.forEach(member => { (اعضای قبلی)
        //    if(member.id !== userIdToAdd && member.id !== adminUser.id)
        //        io.to(member.id).emit('memberAddedToGroup', { chatId, newMember: addedMemberDetails, systemMessage });
        // });
        // io.to(adminUser.id).emit('memberAddedToGroup', ...); // به خود ادمین هم می توان فرستاد
        // یا یک رویداد کلی به روم چت:
        // io.to(chatId).emit('groupUpdate', { type: 'member_added', actor: adminUser, target: userToAdInstance, systemMessage });


        res.status(201).json({
            success: true,
            message: `${newMemberName} added to the group.`,
            member: addedMemberDetails
        });

    } catch (error) {
        await t.rollback();
        console.error('Error adding member to group:', error);
        res.status(500).json({ success: false, message: 'Server error while adding member.' });
    }
};


// @desc    Leave a group chat
// @route   DELETE /api/chats/:chatId/members/me  (یا POST /api/chats/:chatId/leave)
// @access  Private (Member of the group)
exports.leaveGroupChat = async (req, res) => {
    const { chatId } = req.params;
    const userIdLeaving = req.user.id;
    // const chat = req.chat; // اگر از middleware ای استفاده می کنید که چت را attach می کند

    const t = await sequelize.transaction();
    try {
        const chat = await Chat.findByPk(chatId); // ابتدا چت را پیدا کن
        if (!chat) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Chat not found.' });
        }
        if (chat.type !== 'group') {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'This operation is only for group chats.' });
        }

        const membership = await ChatMember.findOne({
            where: { chatId, userId: userIdLeaving },
            transaction: t,
        });

        if (!membership) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'You are not a member of this group.' });
        }

        await membership.destroy({ transaction: t });

        // منطق مدیریت ادمین:
        // اگر کاربر خارج شده ادمین بود و آخرین ادمین گروه بود، چه اتفاقی بیفتد؟
        // ۱. گروه حذف شود؟
        // ۲. یک عضو دیگر به صورت تصادفی ادمین شود؟
        // ۳. گروه بدون ادمین بماند (باید منطق برنامه این را پشتیبانی کند)؟
        // فعلا این بخش را ساده نگه می داریم.
        if (membership.role === 'admin') {
            const remainingAdmins = await ChatMember.count({ where: { chatId, role: 'admin' }, transaction: t});
            if (remainingAdmins === 0) {
                // اگر هیچ ادمین دیگری باقی نماند
                const remainingMembers = await ChatMember.count({ where: { chatId }, transaction: t });
                if (remainingMembers > 0) {
                    // یک عضو دیگر را به ادمین ارتقا بده (مثلا اولین عضو باقی مانده بر اساس joinedAt)
                    const newAdminCandidate = await ChatMember.findOne({
                        where: { chatId },
                        order: [['joinedAt', 'ASC']], // یا createdAt جدول ChatMember
                        transaction: t,
                    });
                    if (newAdminCandidate) {
                        await newAdminCandidate.update({ role: 'admin' }, { transaction: t });
                        // ایجاد پیام سیستمی برای ارتقا ادمین جدید
                        const newAdminUser = await User.findByPk(newAdminCandidate.userId, { attributes: ['displayName', 'username']});
                        const newAdminName = newAdminUser.displayName || newAdminUser.username;
                        await createSystemMessage(chatId, `${newAdminName} is now an admin.`, t);
                    }
                } else {
                    // اگر هیچ عضوی باقی نماند، گروه را حذف کن
                    await Chat.destroy({ where: { id: chatId }, transaction: t });
                    console.log(`Group ${chatId} deleted as last member (admin) left.`);
                    // TODO: به سوکت ها اطلاع داده شود که گروه حذف شده
                }
            }
        }


        // ایجاد پیام سیستمی
        const userLeavingDetails = req.user;
        const userName = userLeavingDetails.displayName || userLeavingDetails.username;
        const systemMessageContent = `${userName} left the group.`;
        const systemMessage = await createSystemMessage(chatId, systemMessageContent, t);

        // آپدیت lastMessageId و updatedAt چت
        // فقط اگر گروه هنوز وجود دارد
        const groupExistsAfterLeave = await Chat.findByPk(chatId, { transaction: t, attributes: ['id']});
        if (groupExistsAfterLeave) {
            await Chat.update(
                { lastMessageId: systemMessage.id, updatedAt: new Date() },
                { where: { id: chatId }, transaction: t }
            );
        }

        await t.commit();

        // ** اطلاع رسانی از طریق سوکت **
        if (groupExistsAfterLeave && io) {
            const membersOfGroup = await chat.getMembers({ attributes: ['id'] }); // اعضای باقی مانده
            membersOfGroup.forEach(member => {
                io.to(member.id).emit('memberLeftGroup', {
                    chatId,
                    userId: userIdLeaving,
                    actor: {id: userIdLeaving, name: userName }
                });
                io.to(member.id).emit('newMessage', { ...systemMessage.toJSON(), tempId: `sys_${Date.now()}` });
            });
            // به خود کاربر خارج شده هم اطلاع بده که با موفقیت خارج شده (اختیاری، چون کلاینت معمولا UI را آپدیت می کند)
            io.to(userIdLeaving).emit('leftGroupSuccessfully', { chatId });
        }


        res.status(200).json({ success: true, message: 'Successfully left the group.' });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error leaving group:', error);
        res.status(500).json({ success: false, message: 'Server error while leaving group.' });
    }
};


// @desc    Remove a member from a group chat (Admin only)
// @route   DELETE /api/chats/:chatId/members/:memberIdToRemove
// @access  Private (Admin only)
exports.removeMemberFromGroup = async (req, res) => {
    const { chatId, memberIdToRemove } = req.params;
    const adminUser = req.user; // ادمینی که درخواست را ارسال کرده
    // req.chat از ensureGroupAdmin

    if (memberIdToRemove === adminUser.id) {
        return res.status(400).json({ success: false, message: "Admin cannot remove themselves using this endpoint. Use 'leave group' instead." });
    }

    const t = await sequelize.transaction();
    try {
        const userToRemoveDetails = await User.findByPk(memberIdToRemove, { attributes: ['id', 'displayName', 'username']});
        if (!userToRemoveDetails) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User to remove not found.' });
        }

        const membershipToRemove = await ChatMember.findOne({
            where: { chatId, userId: memberIdToRemove },
            transaction: t,
        });

        if (!membershipToRemove) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User is not a member of this group.' });
        }

        // اگر ادمین دیگری سعی در حذف یک ادمین دیگر دارد (بسته به سیاست برنامه)
        // if (membershipToRemove.role === 'admin' && req.chat.creatorId !== adminUser.id) {
        //   // فقط ایجاد کننده اصلی گروه می تواند سایر ادمین ها را حذف کند (یک نمونه سیاست)
        //   await t.rollback();
        //   return res.status(403).json({ success: false, message: 'Only the group creator can remove other admins.' });
        // }

        await membershipToRemove.destroy({ transaction: t });

        // ایجاد پیام سیستمی
        const removedUserName = userToRemoveDetails.displayName || userToRemoveDetails.username;
        const adminName = adminUser.displayName || adminUser.username;
        const systemMessageContent = `${adminName} removed ${removedUserName} from the group.`;
        const systemMessage = await createSystemMessage(chatId, systemMessageContent, t);

        // آپدیت lastMessageId و updatedAt چت
        await Chat.update(
            { lastMessageId: systemMessage.id, updatedAt: new Date() },
            { where: { id: chatId }, transaction: t }
        );

        await t.commit();

        // ** اطلاع رسانی از طریق سوکت **
        if (io) {
            // به کاربر حذف شده اطلاع بده
            io.to(memberIdToRemove).emit('removedFromGroup', { chatId, groupName: req.chat.name, actorName: adminName });

            // به سایر اعضای گروه اطلاع بده
            const chat = req.chat;
            const membersOfGroup = await chat.getMembers({ attributes: ['id'] });
            membersOfGroup.forEach(member => {
                if (member.id !== memberIdToRemove) { // به جز کاربر حذف شده
                    io.to(member.id).emit('memberRemovedFromGroup', {
                        chatId,
                        userIdRemoved: memberIdToRemove,
                        actor: {id: adminUser.id, name: adminName }
                    });
                    io.to(member.id).emit('newMessage', { ...systemMessage.toJSON(), tempId: `sys_${Date.now()}` });
                }
            });
        }

        res.status(200).json({ success: true, message: 'User removed from the group successfully.' });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error removing member from group:', error);
        res.status(500).json({ success: false, message: 'Server error while removing member.' });
    }
};