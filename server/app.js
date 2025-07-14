const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل الخادم...');

// إعدادات الوسائط
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== ربط APIs الحقيقية =====
app.use('/api', require('./routes/api'));

// ===== الصفحات =====

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/home.html'));
});

// صفحة أوامر الشراء
app.get('/purchase-orders', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/purchase-orders.html'));
});

// صفحة إضافة فاتورة
app.get('/add', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/add.html'));
});

// صفحة عرض الفواتير
app.get('/view', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/view.html'));
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
    console.error('خطأ في الخادم:', err);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم'
    });
});

// 404
app.use((req, res) => {
    res.status(404).send(`
        <div style="text-align: center; font-family: Arial; padding: 50px;">
            <h1>404 - الصفحة غير موجودة</h1>
            <a href="/">العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// تهيئة قاعدة البيانات وتشغيل الخادم
async function startServer() {
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        await initializeDatabase();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        
        app.listen(PORT, () => {
            console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
            console.log(`🌐 الموقع متاح على Railway`);
        });
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        
        // تشغيل الخادم حتى لو فشلت قاعدة البيانات
        app.listen(PORT, () => {
            console.log(`⚠️ الخادم يعمل على المنفذ ${PORT} (بدون قاعدة بيانات)`);
        });
    }
}

startServer();

module.exports = app;
