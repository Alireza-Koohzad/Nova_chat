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
            type: DataTypes.ENUM('private', 'group'), // نوع چت
            allowNull: false,
            defaultValue: 'private',
        },
        name: { // نام گروه (برای چت خصوصی می‌تواند null باشد)
            type: DataTypes.STRING,
            allowNull: true,
        },
        creatorId: { // شناسه کاربری که گروه را ایجاد کرده (فقط برای گروه)
            type: DataTypes.UUID,
            allowNull: true,
        },
        lastMessageId: { // شناسه آخرین پیام در این چت
            type: DataTypes.UUID,
            allowNull: true,
        },
        groupImageUrl: {
          type: DataTypes.STRING,
          allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'Chat',
        tableName: 'chats',
        timestamps: true, // createdAt, updatedAt
    }
);

module.exports = Chat;