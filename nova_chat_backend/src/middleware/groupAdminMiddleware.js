const ChatMember = require('../models/ChatMember');
const Chat = require('../models/Chat');

const ensureGroupAdmin = async (req, res, next) => {
    const { chatId } = req.params; // chatId از پارامترهای روت خوانده می‌شود
    const userId = req.user.id; // userId از میان‌افزار protect (JWT) می‌آید

    if (!chatId) {
        return res.status(400).json({ success: false, message: 'Chat ID is required.' });
    }

    try {
        const chat = await Chat.findByPk(chatId);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found.' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ success: false, message: 'This operation is only valid for group chats.' });
        }

        const membership = await ChatMember.findOne({
            where: {
                chatId: chatId,
                userId: userId,
            },
        });

        if (!membership) {
            return res.status(403).json({ success: false, message: 'Forbidden: You are not a member of this group.' });
        }

        if (membership.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not have admin privileges for this group.' });
        }

        req.chat = chat; // چت را به req اضافه می‌کنیم برای استفاده در کنترلر
        req.membership = membership; // عضویت ادمین را هم اضافه می‌کنیم
        next();
    } catch (error) {
        console.error('Error in ensureGroupAdmin middleware:', error);
        res.status(500).json({ success: false, message: 'Server error while checking admin privileges.' });
    }
};

// (اختیاری) Middleware برای بررسی اینکه کاربر فقط عضو گروه است (نه لزوما ادمین)
const ensureGroupMember = async (req, res, next) => {
    const { chatId } = req.params;
    const userId = req.user.id;

    if (!chatId) return res.status(400).json({ success: false, message: 'Chat ID is required.' });

    try {
        const chat = await Chat.findByPk(chatId);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found.' });
        // این میان افزار می تواند برای چت خصوصی هم استفاده شود اگر نوع چک نشود

        const membership = await ChatMember.findOne({ where: { chatId, userId } });
        if (!membership) {
            return res.status(403).json({ success: false, message: 'Forbidden: You are not a member of this chat.' });
        }
        req.chat = chat;
        req.membership = membership;
        next();
    } catch (error) {
        console.error('Error in ensureGroupMember middleware:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};


module.exports = { ensureGroupAdmin, ensureGroupMember };