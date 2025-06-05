// src/routes/chatRoutes.js
const express = require('express');
const {
    createOrGetPrivateChat,
    getUserChats,
    getChatMessages,
    // createGroupChat,
    // addMemberToGroup,
} = require('../controllers/chatController'); // این فایل را ایجاد خواهیم کرد
const { protect } = require('../middleware/authMiddleware'); // میان‌افزار احراز هویت HTTP
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat and message management
 */

/**
 * @swagger
 * /api/chats:
 *   get:
 *     summary: Get all chats for the logged-in user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of chats
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatResponse' # باید این schema را در swagger.js تعریف کنید
 *       401:
 *         description: Not authorized
 */
router.get('/', protect, getUserChats);

/**
 * @swagger
 * /api/chats/private/{recipientId}:
 *   post:
 *     summary: Create or get a private chat with another user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: recipientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to chat with
 *     responses:
 *       200:
 *         description: Private chat created or retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatDetailResponse' # باید این schema را در swagger.js تعریف کنید
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Recipient user not found
 */
router.post('/private/:recipientId', protect, createOrGetPrivateChat);

/**
 * @swagger
 * /api/chats/{chatId}/messages:
 *   get:
 *     summary: Get messages for a specific chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the chat
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of messages to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of messages to skip (for pagination)
 *     responses:
 *       200:
 *         description: A list of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MessageResponse' # باید این schema را در swagger.js تعریف کنید
 *       401:
 *         description: Not authorized
 *       403:
 *         description: User is not a member of this chat
 *       404:
 *         description: Chat not found
 */
router.get('/:chatId/messages', protect, getChatMessages);


module.exports = router;