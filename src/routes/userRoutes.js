// src/routes/userRoutes.js
const express = require('express');
const { updateMyProfile , searchUsers } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { updateProfileValidation } = require('../middleware/validators');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update current logged in user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: Johnny D.
 *               profileImageUrl:
 *                 type: string
 *                 format: url
 *                 example: http://example.com/image.png
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Not authorized
 */
router.put('/me', protect, updateProfileValidation, updateMyProfile);

router.get('/search', protect, searchUsers); // اضافه کردن روت جستجو


module.exports = router;