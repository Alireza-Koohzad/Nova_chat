// src/models/Message.js
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Message extends Model {}

Message.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        chatId: {
            type: DataTypes.UUID,
            allowNull: false,
            // references: { model: 'Chats', key: 'id' }
        },
        senderId: {
            type: DataTypes.UUID,
            allowNull: true, // Null for system messages
            // references: { model: 'Users', key: 'id' }
        },
        content: {
            type: DataTypes.TEXT, // برای پیام‌های طولانی‌تر
            allowNull: false,
        },
        contentType: {
            type: DataTypes.ENUM('text', 'image', 'video', 'file', 'system'), // system برای پیام‌های سیستمی مثل "User X joined"
            allowNull: false,
            defaultValue: 'text',
        },
        fileUrl: { // برای فایل‌ها
            type: DataTypes.STRING,
            allowNull: true,
        },
        deliveryStatus: { // وضعیت پیام از دید فرستنده
            type: DataTypes.ENUM('sent', 'delivered', 'read'),
            allowNull: false, // باید همیشه یک وضعیت داشته باشد
            defaultValue: 'sent', // پیش‌فرض پس از ذخیره در دیتابیس
        }
    },
    {
        sequelize,
        modelName: 'Message',
        tableName: 'messages',
        timestamps: true, // createdAt, updatedAt
        // deletedAt برای soft delete در فاز بعدی
    }
);

module.exports = Message;