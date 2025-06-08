// src/controllers/chatController.js
const {Op} = require('sequelize');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const ChatMember = require('../models/ChatMember');
const {sequelize} = require('../config/database'); // برای تراکنش‌ها
const { validationResult } = require('express-validator');
const { io } = require('../server'); // Assuming io is exported from server.js


// Helper function to format chat response
const formatChatResponse = async (chat, currentUserId) => {
    if (!chat) return null;
    const chatJSON = chat.toJSON ? chat.toJSON() : { ...chat };

    if (!chatJSON.members || chatJSON.members.some(m => !m.username)) {
        const fullChat = await Chat.findByPk(chatJSON.id, {
            include: [{
                model: User,
                as: 'members',
                attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                through: { model: ChatMember, attributes: ['role'] }
            }]
        });
        if (fullChat) {
            chatJSON.members = fullChat.members.map(member => member.toJSON());
        }
    }

    if (chatJSON.members && chatJSON.members.length > 0) {
        chatJSON.members = chatJSON.members.map(member => ({
            id: member.id,
            username: member.username,
            displayName: member.displayName,
            profileImageUrl: member.profileImageUrl,
            role: member.ChatMember?.role || (member.id === chatJSON.creatorId ? 'admin' : 'member')
        }));
    }

    if (chatJSON.type === 'private') {
        const otherMemberUser = chatJSON.members?.find(m => m.id !== currentUserId);
        if (otherMemberUser) {
            chatJSON.name = otherMemberUser.displayName || otherMemberUser.username;
            chatJSON.profileImageUrl = otherMemberUser.profileImageUrl;
            chatJSON.recipientId = otherMemberUser.id;
        } else {
            chatJSON.name = chatJSON.name || "Private Chat";
        }
    }

    if (chat.lastMessage && typeof chat.lastMessage.toJSON === 'function') {
        chatJSON.lastMessage = chat.lastMessage.toJSON();
        if (chat.lastMessage.sender && typeof chat.lastMessage.sender.toJSON === 'function') {
            chatJSON.lastMessage.sender = chat.lastMessage.sender.toJSON();
        }
    } else if (chat.lastMessageId && !chatJSON.lastMessage) {
        const lastMsg = await Message.findByPk(chat.lastMessageId, {
            attributes: ['id', 'chatId', 'senderId', 'content', 'contentType', 'fileUrl', 'deliveryStatus', 'createdAt', 'updatedAt'],
            include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'profileImageUrl']}]
        });
        if (lastMsg) {
            chatJSON.lastMessage = lastMsg.toJSON();
        }
    }
    chatJSON.unreadCount = chatJSON.unreadCount || 0;
    return chatJSON;
};


// @desc    Get all chats for the logged-in user
// @route   GET /api/chats
// @access  Private
exports.getUserChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const userChatMemberships = await ChatMember.findAll({
            where: { userId },
            attributes: ['chatId']
        });
        const chatIds = userChatMemberships.map(cm => cm.chatId);

        if (chatIds.length === 0) {
            return res.json([]);
        }

        const chats = await Chat.findAll({
            where: { id: { [Op.in]: chatIds } },
            include: [
                {
                    model: User,
                    as: 'members',
                    attributes: ['id', 'username', 'displayName', 'profileImageUrl'],
                    through: { model: ChatMember, attributes: ['role'] }
                },
                {
                    model: Message,
                    as: 'lastMessage',
                    attributes: ['id', 'chatId', 'senderId', 'content', 'contentType', 'fileUrl', 'deliveryStatus', 'createdAt', 'updatedAt'],
                    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'profileImageUrl']}]
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'displayName']
                }
            ],
            order: [['updatedAt', 'DESC']],
        });

        const formattedChatsPromises = chats.map(chat => formatChatResponse(chat, userId));
        let formattedChats = await Promise.all(formattedChatsPromises);

        formattedChats.sort((a, b) => {
            const dateA = new Date(a.lastMessage?.createdAt || a.updatedAt || 0);
            const dateB = new Date(b.lastMessage?.createdAt || b.updatedAt || 0);
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
    const { recipientId } = req.params;

    if (senderId === recipientId) {
        return res.status(400).json({ success: false, message: "Cannot create a chat with yourself." });
    }

    try {
        const recipient = await User.findByPk(recipientId);
        if (!recipient) {
            return res.status(404).json({ success: false, message: 'Recipient user not found.' });
        }

        const senderMemberRecords = await ChatMember.findAll({ where: { userId: senderId } });
        const senderChatIds = senderMemberRecords.map(cm => cm.chatId);

        let foundChat = null;
        if (senderChatIds.length > 0) {
            const potentialChats = await Chat.findAll({
                where: {
                    id: { [Op.in]: senderChatIds },
                    type: 'private'
                },
                include: [{
                    model: User,
                    as: 'members',
                    attributes: ['id']
                }]
            });

            for (const chat of potentialChats) {
                if (chat.members.length === 2) {
                    const memberIds = chat.members.map(m => m.id);
                    if (memberIds.includes(senderId) && memberIds.includes(recipientId)) {
                        foundChat = chat;
                        break;
                    }
                }
            }
        }

        if (foundChat) {
            const detailedChat = await Chat.findByPk(foundChat.id, {
                include: [
                    { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: {attributes: ['role']} },
                    {
                        model: Message,
                        as: 'lastMessage',
                        attributes: ['id', 'chatId', 'senderId', 'content', 'contentType', 'fileUrl', 'deliveryStatus', 'createdAt', 'updatedAt'],
                        include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'profileImageUrl'] }]
                    }
                ]
            });
            return res.json(await formatChatResponse(detailedChat, senderId));
        }

        const t = await sequelize.transaction();
        try {
            const newChat = await Chat.create({ type: 'private' }, { transaction: t });
            await ChatMember.bulkCreate([
                { chatId: newChat.id, userId: senderId, role: 'member' },
                { chatId: newChat.id, userId: recipientId, role: 'member' },
            ], { transaction: t });

            await t.commit();

            const detailedNewChat = await Chat.findByPk(newChat.id, {
                include: [
                    { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: {attributes: ['role']} }
                ]
            });
            const formattedNewChat = await formatChatResponse(detailedNewChat, senderId);
            if (io && formattedNewChat) {
                [senderId, recipientId].forEach(uid => {
                    io.to(uid).emit('newChat', formattedNewChat);
                });
            }
            return res.status(201).json(formattedNewChat);

        } catch (error) {
            await t.rollback();
            console.error('Error creating private chat transaction:', error);
            throw error;
        }

    } catch (error) {
        console.error('Error in createOrGetPrivateChat:', error);
        res.status(500).json({ success: false, message: 'Server error creating or getting private chat' });
    }
};


// @desc    Get messages for a specific chat
// @route   GET /api/chats/:chatId/messages
// @access  Private
exports.getChatMessages = async (req, res) => {
    const { chatId } = req.params;
    const currentUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;
    const requestedOrder = (req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';


    try {
        const chatMember = await ChatMember.findOne({ where: { chatId, userId: currentUserId } });
        if (!chatMember) {
            return res.status(403).json({ success: false, message: "You are not a member of this chat." });
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
            attributes: ['id', 'chatId', 'senderId', 'content', 'contentType', 'fileUrl', 'deliveryStatus', 'createdAt', 'updatedAt'],
            order: [['createdAt', requestedOrder]],
            limit,
            offset,
        });
        res.json(requestedOrder === 'DESC' ? messagesFromDB.reverse() : messagesFromDB);

    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Server error fetching messages' });
    }
};

// Helper to create system messages
const createSystemMessageAndUpdateChat = async (chatId, content, transaction = null) => {
    const systemMessage = await Message.create({
        chatId,
        content,
        contentType: 'system',
        deliveryStatus: 'sent',
    }, { transaction });

    await Chat.update(
        { lastMessageId: systemMessage.id, updatedAt: new Date() },
        { where: { id: chatId }, transaction }
    );
    return systemMessage;
};


// @desc    Create a new group chat
// @route   POST /api/chats/groups
// @access  Private
exports.createGroupChat = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, memberIds = [], groupImageUrl } = req.body;
    const creatorId = req.user.id;

    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Group name is required.' });
    }

    const finalMemberIds = [...new Set([creatorId, ...memberIds])];

    const t = await sequelize.transaction();
    try {
        const newGroup = await Chat.create({
            type: 'group',
            name,
            creatorId,
            groupImageUrl,
        }, { transaction: t });

        const chatMembersData = finalMemberIds.map(userId => ({
            chatId: newGroup.id,
            userId,
            role: userId === creatorId ? 'admin' : 'member',
        }));
        await ChatMember.bulkCreate(chatMembersData, { transaction: t });

        const creatorUser = await User.findByPk(creatorId, { attributes: ['displayName', 'username']});
        const creatorName = creatorUser.displayName || creatorUser.username;
        const systemMessage = await createSystemMessageAndUpdateChat(
            newGroup.id,
            `${creatorName} created the group "${name}"`,
            t
        );

        await t.commit();

        const groupDetails = await Chat.findByPk(newGroup.id, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username', 'displayName'] },
                { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: { attributes: ['role'] }},
                {
                    model: Message,
                    as: 'lastMessage',
                    attributes: ['id', 'chatId', 'senderId', 'content', 'contentType', 'fileUrl', 'deliveryStatus', 'createdAt', 'updatedAt'],
                    include: [{model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'profileImageUrl']}]
                }
            ]
        });
        const formattedGroup = await formatChatResponse(groupDetails, creatorId);

        if (io && formattedGroup) {
            finalMemberIds.forEach(memberId => {
                io.to(memberId).emit('newChat', formattedGroup);
            });
        }
        res.status(201).json(formattedGroup);

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
    const { userId: userIdToAdd } = req.body;
    const adminUser = req.user;
    const chat = req.chat;

    if (!userIdToAdd) {
        return res.status(400).json({ success: false, message: 'User ID to add is required.' });
    }
    if (userIdToAdd === adminUser.id) {
        return res.status(400).json({ success: false, message: 'Admin is already a member.' });
    }

    const t = await sequelize.transaction();
    try {
        const userToAddInstance = await User.findByPk(userIdToAdd);
        if (!userToAddInstance) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User to add not found.' });
        }

        const existingMembership = await ChatMember.findOne({ where: { chatId, userId: userIdToAdd }, transaction: t });
        if (existingMembership) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'User is already a member of this group.' });
        }

        const newMember = await ChatMember.create({ chatId, userId: userIdToAdd, role: 'member' }, { transaction: t });

        const adminName = adminUser.displayName || adminUser.username;
        const newMemberName = userToAddInstance.displayName || userToAddInstance.username;
        const systemMessageContent = `${adminName} added ${newMemberName} to the group.`;
        const systemMessage = await createSystemMessageAndUpdateChat(chatId, systemMessageContent, t);

        await t.commit();

        const addedMemberDetails = {
            id: newMember.userId,
            username: userToAddInstance.username,
            displayName: userToAddInstance.displayName,
            profileImageUrl: userToAddInstance.profileImageUrl,
            role: newMember.role,
            ChatMember: { role: newMember.role, joinedAt: newMember.joinedAt }
        };

        if (io) {
            const fullChatDetails = await Chat.findByPk(chatId, {
                include: [ { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: {attributes: ['role']} }]
            });
            const formattedChat = await formatChatResponse(fullChatDetails, null);

            (fullChatDetails.members || []).forEach(member => {
                io.to(member.id).emit('memberAddedToGroup', {
                    chatId,
                    addedMember: addedMemberDetails,
                    actor: { id: adminUser.id, name: adminName },
                    systemMessage: systemMessage.toJSON(),
                    updatedChat: formattedChat
                });
            });
        }

        res.status(201).json({ success: true, message: `${newMemberName} added.`, member: addedMemberDetails });
    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error adding member to group:', error);
        res.status(500).json({ success: false, message: 'Server error while adding member.' });
    }
};


// @desc    Leave a group chat
// @route   DELETE /api/chats/:chatId/members/me
// @access  Private (Member of the group)
exports.leaveGroupChat = async (req, res) => {
    const { chatId } = req.params;
    const userIdLeaving = req.user.id;

    const t = await sequelize.transaction();
    try {
        const chat = await Chat.findByPk(chatId);
        if (!chat || chat.type !== 'group') {
            await t.rollback();
            return res.status(chat ? 400 : 404).json({ success: false, message: chat ? 'Operation only for group chats.' : 'Chat not found.' });
        }

        const membership = await ChatMember.findOne({ where: { chatId, userId: userIdLeaving }, transaction: t });
        if (!membership) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'You are not a member of this group.' });
        }

        await membership.destroy({ transaction: t });

        const userLeavingDetails = req.user;
        const userName = userLeavingDetails.displayName || userLeavingDetails.username;
        let systemMessageContent = `${userName} left the group.`;
        let newAdminName = null;

        if (membership.role === 'admin') {
            const remainingAdmins = await ChatMember.count({ where: { chatId, role: 'admin' }, transaction: t});
            if (remainingAdmins === 0) {
                const remainingMembers = await ChatMember.findAll({ where: { chatId }, order: [['joinedAt', 'ASC']], limit: 1, transaction: t });
                if (remainingMembers.length > 0) {
                    const newAdminCandidate = remainingMembers[0];
                    await newAdminCandidate.update({ role: 'admin' }, { transaction: t });
                    const newAdminUser = await User.findByPk(newAdminCandidate.userId, { attributes: ['displayName', 'username'], transaction: t });
                    newAdminName = newAdminUser.displayName || newAdminUser.username;
                    systemMessageContent += ` ${newAdminName} is now an admin.`;
                } else {
                    await Chat.destroy({ where: { id: chatId }, transaction: t });
                    console.log(`Group ${chatId} deleted as last member left.`);
                    if (io) io.to(userIdLeaving).emit('groupDeleted', { chatId });
                    await t.commit();
                    return res.status(200).json({ success: true, message: 'Successfully left and group deleted.' });
                }
            }
        }

        const systemMessage = await createSystemMessageAndUpdateChat(chatId, systemMessageContent, t);
        await t.commit();

        if (io) {
            const remainingMembers = await ChatMember.findAll({ where: { chatId }, include: [{model: User, as: 'user', attributes: ['id']}]});
            const fullChatDetails = await Chat.findByPk(chatId, {
                include: [ { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: {attributes: ['role']} }]
            });
            const formattedChat = await formatChatResponse(fullChatDetails, null);

            remainingMembers.forEach(member => {
                io.to(member.userId).emit('memberLeftGroup', {
                    chatId,
                    userId: userIdLeaving,
                    actor: { id: userIdLeaving, name: userName },
                    systemMessage: systemMessage.toJSON(),
                    newAdminName: newAdminName,
                    updatedChat: formattedChat
                });
            });
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
    const adminUser = req.user;
    const chat = req.chat;

    if (memberIdToRemove === adminUser.id) {
        return res.status(400).json({ success: false, message: "Admin cannot remove themselves. Use 'leave group'." });
    }

    const t = await sequelize.transaction();
    try {
        const userToRemoveInstance = await User.findByPk(memberIdToRemove, { attributes: ['id', 'displayName', 'username'] });
        if (!userToRemoveInstance) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User to remove not found.' });
        }

        const membershipToRemove = await ChatMember.findOne({ where: { chatId, userId: memberIdToRemove }, transaction: t });
        if (!membershipToRemove) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'User is not a member of this group.' });
        }

        if (membershipToRemove.role === 'admin' && chat.creatorId !== adminUser.id && chat.creatorId === memberIdToRemove) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'Cannot remove the group creator.' });
        }
        if (membershipToRemove.role === 'admin' && chat.creatorId !== adminUser.id) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'Only the group creator can remove other admins.' });
        }


        await membershipToRemove.destroy({ transaction: t });

        const removedUserName = userToRemoveInstance.displayName || userToRemoveInstance.username;
        const adminName = adminUser.displayName || adminUser.username;
        const systemMessageContent = `${adminName} removed ${removedUserName} from the group.`;
        const systemMessage = await createSystemMessageAndUpdateChat(chatId, systemMessageContent, t);

        await t.commit();

        if (io) {
            const fullChatDetails = await Chat.findByPk(chatId, {
                include: [ { model: User, as: 'members', attributes: ['id', 'username', 'displayName', 'profileImageUrl'], through: {attributes: ['role']} }]
            });
            const formattedChat = await formatChatResponse(fullChatDetails, null);

            io.to(memberIdToRemove).emit('removedFromGroup', { chatId, groupName: chat.name, actorName: adminName, updatedChat: null });
            const remainingMembers = await ChatMember.findAll({ where: { chatId }, include: [{model: User, as: 'user', attributes: ['id']}]});
            remainingMembers.forEach(member => {
                io.to(member.userId).emit('memberRemovedFromGroup', {
                    chatId,
                    userIdRemoved: memberIdToRemove,
                    actor: { id: adminUser.id, name: adminName },
                    systemMessage: systemMessage.toJSON(),
                    updatedChat: formattedChat
                });
            });
        }

        res.status(200).json({ success: true, message: 'User removed successfully.' });

    } catch (error) {
        if (!t.finished) await t.rollback();
        console.error('Error removing member from group:', error);
        res.status(500).json({ success: false, message: 'Server error while removing member.' });
    }
};
