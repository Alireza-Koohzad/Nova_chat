// src/middleware/socketAuthMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const verifySocketToken = async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
        console.log("Socket Auth: No token provided");
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.id, {
            attributes: { exclude: ['password'] },
        });

        if (!user) {
            console.log("Socket Auth: User not found for token");
            return next(new Error('Authentication error: User not found'));
        }

        socket.userId = user.id; // شناسه کاربر را به آبجکت socket اضافه می‌کنیم
        socket.user = user.toJSON(); // اطلاعات کامل کاربر (بدون پسورد)
        next();
    } catch (error) {
        console.error("Socket Auth Error:", error.message);
        return next(new Error(`Authentication error: ${error.message}`));
    }
};

module.exports = { verifySocketToken };