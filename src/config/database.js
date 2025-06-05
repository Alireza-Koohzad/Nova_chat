// src/config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false, // true برای دیدن کوئری‌های SQL در کنسول
    }
);

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected...');
        // await sequelize.sync({ alter: true }); // یا force: true برای توسعه. در پروداکشن با احتیاط استفاده شود.
        // console.log('Database synchronized.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        process.exit(1); // خروج از برنامه در صورت عدم اتصال
    }
};

module.exports = { sequelize, connectDB };