// src/models/Chat.js
const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Chat extends Model {}

Chat.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        type: {
            type: DataTypes.ENUM('private', 'group'),
            allowNull: false,
            defaultValue: 'private',
        },
        name: { // برای گروه‌ها
            type: DataTypes.STRING,
            allowNull: true,
        },
        creatorId: { // برای گروه‌ها، شناسه کاربری که گروه را ایجاد کرده
            type: DataTypes.UUID,
            allowNull: true,
            // onDelete: 'SET NULL' // اگر کاربر حذف شد، مقدار null شود
            // references: { model: 'Users', key: 'id' } // این در association تعریف می‌شود
        },
        lastMessageId: { // شناسه آخرین پیام در این چت (برای sort کردن چت‌ها و نمایش پیش‌نمایش)
            type: DataTypes.UUID,
            allowNull: true,
            // references: { model: 'Messages', key: 'id' } // این در association تعریف می‌شود
        }
    },
    {
        sequelize,
        modelName: 'Chat',
        tableName: 'chats',
        timestamps: true,
    }
);

module.exports = Chat;