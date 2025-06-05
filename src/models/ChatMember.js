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
            // references: { model: 'Chats', key: 'id' }
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            // references: { model: 'Users', key: 'id' }
        },
        role: { // برای گروه‌ها: admin, member
            type: DataTypes.ENUM('member', 'admin'),
            defaultValue: 'member',
        },
        joinedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        lastReadMessageId: { // آخرین پیامی که کاربر در این چت خوانده است
            type: DataTypes.UUID,
            allowNull: true,
            // references: { model: 'Messages', key: 'id' }
        },

    },
    {
        sequelize,
        modelName: 'ChatMember',
        tableName: 'chat_members',
        timestamps: false, // createdAt/updatedAt ممکن است اینجا لازم نباشد یا فقط createdAt
        indexes: [ // برای جستجوی سریع‌تر
            {
                unique: true,
                fields: ['chatId', 'userId'], // هر کاربر فقط یک بار می‌تواند عضو یک چت باشد
            },
        ],
    }
);

module.exports = ChatMember;