const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل الخادم...');

// إعدادات الوسائط
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== APIs بسيطة جداً =====

// اختبار أساسي
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل بنجاح!',
        timestamp: new Date().toISOString()
    });
});

// إحصائيات وهمية
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            suppliersCount: 0,
            invoicesCount: 0,
            ordersCount: 0,
            totalAmount: 0
        }
    });
});

// موردين فارغ
app.get('/api/suppliers-with-stats', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

// فواتير فارغة
app.get('/api/recent-invoices', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

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

// 404
app.use((req, res) => {
    res.status(404).send(`
        <div style="text-align: center; font-family: Arial; padding: 50px;">
            <h1>404 - الصفحة غير موجودة</h1>
            <a href="/">العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 الموقع متاح على Railway`);
});

module.exports = app;
