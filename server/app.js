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

// ===== واجهات برمجة التطبيقات (APIs) =====

// اختبار الخادم
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'خادم نظام إدارة المشتريات يعمل بنجاح!', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// معالجة الأخطاء - في حالة عدم وجود الصفحة
app.use((req, res) => {
    res.status(404).send(`
        <h1>الصفحة غير موجودة</h1>
        <p>الصفحة التي تبحث عنها غير متاحة.</p>
        <a href="/">العودة للصفحة الرئيسية</a>
    `);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 خادم نظام إدارة المشتريات يعمل على المنفذ ${PORT}`);
    console.log(`🌐 يمكنك الوصول للموقع عبر: http://localhost:${PORT}`);
    console.log(`📱 Railway URL: سيتم توفيرها تلقائياً عند النشر`);
});

module.exports = app;
