// src/routes/chatRoutes.js
const express = require('express');
const {
    createOrGetPrivateChat,
    getUserChats,
    getChatMessages,
    createGroupChat,
    addMemberToGroup,
    leaveGroupChat,
    removeMemberFromGroup,
} = require('../controllers/chatController'); // این فایل را ایجاد خواهیم کرد
const {protect} = require('../middleware/authMiddleware');
const { ensureGroupAdmin } = require('../middleware/groupAdminMiddleware');
const {body} = require('express-validator'); // برای اعتبارسنجی
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


/**
 * @swagger
 * /api/chats/groups:
 *   post:
 *     summary: Create a new group chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the group
 *                 example: "Project Team"
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Optional array of user IDs to add to the group (creator is added automatically)
 *                 example: ["uuid-for-user2", "uuid-for-user3"]
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatDetailResponse' // از همان schema قبلی استفاده می‌کنیم
 *       400:
 *         description: Bad request (e.g., missing name, invalid member IDs)
 *       401:
 *         description: Not authorized
 */
router.post(
    '/groups',
    protect,
    [
        body('name').notEmpty().withMessage('Group name is required.').trim().escape(),
        body('memberIds').optional().isArray().withMessage('memberIds must be an array.'),
        body('memberIds.*').optional().isUUID().withMessage('Each memberId must be a valid UUID.')
    ],
    createGroupChat
);

/**
 * @swagger
 * /api/chats/{chatId}/members:
 *   post:
 *     summary: Add a member to a group chat (Admin only)
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
 *         description: The ID of the group chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIdToAdd
 *             properties:
 *               userIdToAdd:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the user to add
 *     responses:
 *       200:
 *         description: User added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  success:
 *                      type: boolean
 *                  message:
 *                      type: string
 *                  member: # اطلاعات عضو اضافه شده
 *                      $ref: '#/components/schemas/ChatMemberResponse' # از schema موجود استفاده کنید
 *       400:
 *         description: Bad request (e.g., user already member, missing userIdToAdd)
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden (not an admin or not a member of the group)
 *       404:
 *         description: Chat or User to add not found
 */
router.post(
    '/:chatId/members',
    protect,
    ensureGroupAdmin, // Middleware برای بررسی اینکه کاربر ادمین گروه است
    [
        body('userIdToAdd').isUUID().withMessage('Valid User ID to add is required.')
    ],
    addMemberToGroup
);


/**
 * @swagger
 * /api/chats/{chatId}/members/me:
 *   delete:
 *     summary: Leave a group chat
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
 *         description: The ID of the group chat to leave
 *     responses:
 *       200:
 *         description: Successfully left the group
 *       400:
 *         description: Bad request (e.g., not a group chat)
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Chat not found or user not a member
 */
router.delete(
    '/:chatId/members/me', // 'me' به معنی کاربر فعلی است
    protect, // فقط کاربر لاگین کرده
    // نیازی به ensureGroupAdmin نیست، چون هر عضوی می تواند خارج شود
    leaveGroupChat
);

/**
 * @swagger
 * /api/chats/{chatId}/members/{memberIdToRemove}:
 *   delete:
 *     summary: Remove a member from a group chat (Admin only)
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
 *       - in: path
 *         name: memberIdToRemove
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to remove
 *     responses:
 *       200:
 *         description: User removed successfully
 *       400:
 *         description: Bad request (e.g., admin cannot remove self)
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden (not an admin)
 *       404:
 *         description: Chat, User to remove, or Membership not found
 */
router.delete(
    '/:chatId/members/:memberIdToRemove',
    protect,
    ensureGroupAdmin, // فقط ادمین می تواند حذف کند
    // اینجا می توانید یک اعتبارسنجی برای memberIdToRemove هم اضافه کنید (isUUID)
    removeMemberFromGroup
);


module.exports = router;