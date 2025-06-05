// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, sequelize } = require('./config/database');
const setupSwagger = require('./config/swagger');

// Import مدل‌ها برای اینکه Sequelize آن‌ها را بشناسد (مهم برای sync)
require('./models/User'); // و سایر مدل‌ها در آینده

// Import روت‌ها
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// اتصال به پایگاه داده
connectDB();

// Middleware ها
app.use(cors()); // فعال کردن CORS برای همه روت‌ها
app.use(express.json()); // برای parse کردن JSON body
app.use(express.urlencoded({ extended: true })); // برای parse کردن URL-encoded body

// تنظیم Swagger
setupSwagger(app);

// روت‌های اصلی
app.get('/', (req, res) => {
    res.send('NovaChat API (Express.js) is running!');
});

// استفاده از روت‌های تعریف شده
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Middleware برای مدیریت خطاهای عمومی (باید بعد از روت‌ها بیاید)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ success: false, message: 'Something broke!', error: err.message });
});

// همگام‌سازی پایگاه داده و راه‌اندازی سرور
const startServer = async () => {
    try {
        // await sequelize.sync({ force: true }); // در توسعه: جداول را drop و recreate می‌کند
        await sequelize.sync({ alter: true }); // در توسعه: سعی می‌کند جداول را با مدل‌ها هماهنگ کند بدون از دست دادن داده
        // await sequelize.sync(); // در پروداکشن: فقط اگر جداول وجود نداشته باشند ایجاد می‌کند
        console.log('Database synchronized successfully.');

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to sync database or start server:', error);
        process.exit(1);
    }
};

startServer();