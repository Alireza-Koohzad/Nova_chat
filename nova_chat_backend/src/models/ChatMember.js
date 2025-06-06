// src/models/ChatMember.js
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class ChatMember extends Model {}

ChatMember.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        chatId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        role: { // نقش کاربر در چت (مخصوصا برای گروه ها)
            type: DataTypes.ENUM('member', 'admin'),
            allowNull: false,
            defaultValue: 'member',
        },
        joinedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        lastReadMessageId: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'ChatMember',
        tableName: 'chat_members',
        timestamps: true, // اضافه کردن createdAt و updatedAt می‌تواند مفید باشد
        indexes: [
            {
                unique: true,
                fields: ['chatId', 'userId'],
            },
            {
                fields: ['userId'] // برای جستجوی سریع چت‌های یک کاربر
            }
        ],
    }
);

module.exports = ChatMember;