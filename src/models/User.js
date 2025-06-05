// src/models/User.js
const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

class User extends Model {
    // متد برای بررسی پسورد
    async isValidPassword(password) {
        return bcrypt.compare(password, this.password);
    }
}

User.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: { msg: 'Username cannot be empty' },
                len: [3, 30],
            },
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: { msg: 'Invalid email format' },
                notEmpty: { msg: 'Email cannot be empty' },
            },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: { msg: 'Password cannot be empty' },
                len: [6, 100], // حداقل و حداکثر طول پسورد
            },
        },
        displayName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        profileImageUrl: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('online', 'offline'),
            defaultValue: 'offline',
        },
        lastSeenAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamps: true, // createdAt و updatedAt به صورت خودکار اضافه می‌شوند
        hooks: {
            beforeCreate: async (user) => {
                if (user.password) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
            beforeUpdate: async (user) => {
                // فقط اگر پسورد تغییر کرده باشد، آن را هش کن
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            },
        },
    }
);

module.exports = User;