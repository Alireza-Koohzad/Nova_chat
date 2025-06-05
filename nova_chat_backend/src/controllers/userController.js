// src/controllers/userController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize'); // Op را از sequelize ایمپورت کنید

// @desc    Update user profile (displayName, profileImageUrl)
// @route   PUT /api/users/me
// @access  Private
exports.updateMyProfile = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { displayName, profileImageUrl } = req.body;
    const updateData = {};

    if (displayName !== undefined) updateData.displayName = displayName;
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update provided' });
    }

    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        await user.update(updateData);

        // کاربر آپدیت شده را بدون پسورد برگردان
        const updatedUser = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error updating profile' });
    }
};

exports.searchUsers = async (req, res) => {
    const query = req.query.q || '';
    const currentUserId = req.user.id; // شناسه کاربر لاگین کرده

    if (query.length < 1) { // حداقل ۱ کاراکتر برای جستجو
        return res.json({ success: true, data: [] });
    }
    try {
        const users = await User.findAll({
            where: {
                [Op.or]: [
                    { username: { [Op.iLike]: `%${query}%` } }, // iLike برای case-insensitive
                    { displayName: { [Op.iLike]: `%${query}%` } }
                ],
                id: { [Op.ne]: currentUserId } // به جز خود کاربر لاگین کرده
            },
            attributes: ['id', 'username', 'displayName', 'profileImageUrl'], // اطلاعات لازم برای نمایش
            limit: 10 // محدود کردن نتایج
        });
        res.json({ success: true, data: users });
    } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ success: false, message: "Server error during user search" });
    }
};


// @desc    Get user by ID (برای آینده)
// @route   GET /api/users/:id
// @access  Private (یا Public بسته به نیاز)
// exports.getUserById = async (req, res) => { ... };

// @desc    Search users (برای آینده)
// @route   GET /api/users/search?q=...
// @access  Private
// exports.searchUsers = async (req, res) => { ... };