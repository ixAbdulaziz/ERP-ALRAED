const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الوسائط (Middleware)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة (CSS, JS, Images)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// تهيئة قاعدة البيانات أولاً
console.log('🚀 بدء تشغيل الخادم...');

// استيراد قاعدة البيانات (سيتم تهيئتها تلقائياً)
require('./database');

// تأخير بسيط للتأكد من تهيئة قاعدة البيانات
setTimeout(() => {
    try {
        // استيراد routes للـ APIs بعد تهيئة قاعدة البيانات
        const apiRoutes = require('./routes/api');
        app.use('/api', apiRoutes);
        console.log('✅ تم تحميل APIs بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تحميل APIs:', error.message);
    }
}, 1000);

// ===== توجيه الصفحات الرئيسية =====

// الصفحة الرئيسية - لوحة المعلومات
app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/home.html'));
    } catch (error) {
        console.error('خطأ في تحميل الصفحة الرئيسية:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// صفحة أوامر الشراء
app.get('/purchase-orders', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/purchase-orders.html'));
    } catch (error) {
        console.error('خطأ في تحميل صفحة أوامر الشراء:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// صفحة إضافة فاتورة جديدة
app.get('/add', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/add.html'));
    } catch (error) {
        console.error('خطأ في تحميل صفحة إضافة الفاتورة:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// صفحة عرض فواتير مورد معين
app.get('/view', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/view.html'));
    } catch (error) {
        console.error('خطأ في تحميل صفحة عرض الفواتير:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// API اختبار بسيط (في حالة عدم تحميل routes/api.js)
app.get('/api/test-basic', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل! (اختبار أساسي)',
        database: 'PostgreSQL',
        timestamp: new Date().toISOString()
    });
});

// معالجة الأخطاء العامة
app.use((err, req, res, next) => {
    console.error('خطأ عام في الخادم:', err);
    res.status(500).json({
        success: false,
        message: 'خطأ داخلي في الخادم',
        error: err.message
    });
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
    console.log(`📱 Railway URL: متاح على Railway`);
    console.log(`🔗 اختبار أساسي: /api/test-basic`);
});

module.exports = app;
