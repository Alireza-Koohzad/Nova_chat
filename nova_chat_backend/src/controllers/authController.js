// src/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
require('dotenv').config();

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, email, password, displayName } = req.body;

    try {
        let user = await User.findOne({ where: { email } });
        if (user) {
            return res.status(400).json({ success: false, message: 'User already exists with this email' });
        }
        user = await User.findOne({ where: { username } });
        if (user) {
            return res.status(400).json({ success: false, message: 'User already exists with this username' });
        }

        user = await User.create({
            username,
            email,
            password,
            displayName: displayName || username,
        });

        const token = generateToken(user.id);
        const userResponse = user.toJSON();
        delete userResponse.password; // پسورد را از پاسخ حذف کن

        res.status(201).json({
            success: true,
            token,
            user: userResponse,
        });
    } catch (error) {
        console.error(error);
        // بررسی خطاهای unique constraint
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ success: false, message: 'Username or email already taken.' });
        }
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
};

// @desc    Authenticate user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { login, password } = req.body; // login می‌تواند email یا username باشد

    try {
        let user = await User.findOne({ where: { email: login } });
        if (!user) {
            user = await User.findOne({ where: { username: login } });
        }

        if (!user || !(await user.isValidPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = generateToken(user.id);
        const userResponse = user.toJSON();
        delete userResponse.password;

        res.json({
            success: true,
            token,
            user: userResponse,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// @desc    Get logged in user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    // req.user از میان‌افزار protect می‌آید
    res.json({ success: true, user: req.user });
};
