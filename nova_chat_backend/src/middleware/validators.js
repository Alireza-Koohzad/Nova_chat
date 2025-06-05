// src/middleware/validators.js
const { body } = require('express-validator');

exports.registerValidation = [
    body('username')
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3, max: 30 }).withMessage('Username must be between 3 and 30 characters'),
    body('email')
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
];

exports.loginValidation = [
    body('login').notEmpty().withMessage('Login (username or email) is required'),
    body('password').notEmpty().withMessage('Password is required'),
];

exports.updateProfileValidation = [
    body('displayName').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Display name must be between 1 and 50 characters'),
    body('profileImageUrl').optional().isURL().withMessage('Invalid profile image URL format'),
];