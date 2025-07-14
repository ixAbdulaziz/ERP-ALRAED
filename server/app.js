const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// استيراد قاعدة البيانات وتهيئتها
require('./database');

// استيراد routes للـ APIs
const apiRoutes = require('./routes/api');

// إعدادات الوسائط (Middleware)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة (CSS, JS, Images)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ربط APIs
app.use('/api', apiRoutes);

// ===== توجيه الصفحات الرئيسية =====

// الصفحة الرئيسية - لوحة المعلومات
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/home.html'));
});

// صفحة أوامر الشراء
app.get('/purchase-orders', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/purchase-orders.html'));
});

// صفحة إضافة فاتورة جديدة
app.get('/add', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/add.html'));
});

// صفحة عرض فواتير مورد معين
app.get('/view', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/view.html'));
});

// معالجة الأخطاء - في حالة عدم وجود الصفحة
app.use((req, res) => {
    res.status(404).send(`
        <div style="text-align: center; font-family: 'Cairo', sans-serif; padding: 50px; direction: rtl;">
            <h1 style="color: #dc3545;">404 - الصفحة غير موجودة</h1>
            <p style="color: #666; font-size: 18px;">الصفحة التي تبحث عنها غير متاحة.</p>
            <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px;">العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 خادم نظام إدارة المشتريات يعمل على المنفذ ${PORT}`);
    console.log(`🌐 يمكنك الوصول للموقع عبر: http://localhost:${PORT}`);
    console.log(`📱 Railway URL: سيتم توفيرها تلقائياً عند النشر`);
    console.log(`🔌 APIs متاحة على: /api/test`);
});

module.exports = app;
