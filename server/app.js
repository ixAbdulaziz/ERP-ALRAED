const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل نظام إدارة المشتريات - الرائد');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');

// ============== إعدادات الوسائط ==============

// تمكين CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 
        ['https://erp-alraed.com', 'https://www.erp-alraed.com'] : 
        true,
    credentials: true
}));

// إعدادات المحلل (Parser)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// إعدادات الأمان
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// تسجيل الطلبات
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('ar-SA');
    console.log(`📥 ${req.method} ${req.path} - ${timestamp}`);
    next();
});

// ============== خدمة الملفات الثابتة ==============

// خدمة الملفات المرفوعة
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// خدمة الملفات العامة
app.use(express.static(path.join(__dirname, '../public')));

// ============== ربط APIs ==============

// ربط جميع APIs
app.use('/api', require('./routes/api'));

// ============== صفحات النظام ==============

// دالة مساعدة لإرسال الصفحات
const sendPage = (filePath) => {
    return (req, res) => {
        try {
            const fullPath = path.join(__dirname, '../views', filePath);
            res.sendFile(fullPath);
        } catch (error) {
            console.error(`خطأ في إرسال الصفحة:`, error);
            res.status(500).send('خطأ في تحميل الصفحة');
        }
    };
};

// 🏠 الصفحة الرئيسية
app.get('/', sendPage('home.html'));

// 🛒 صفحة أوامر الشراء
app.get('/purchase-orders', sendPage('purchase-orders.html'));

// ➕ صفحة إضافة فاتورة
app.get('/add', sendPage('add.html'));

// 👁️ صفحة عرض الفواتير
app.get('/view', sendPage('view.html'));

// ============== صفحات إضافية ==============

// صفحة المساعدة
app.get('/help', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>المساعدة - نظام الرائد</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                h1 { color: #333; text-align: center; }
                .back-btn { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>مساعدة نظام إدارة المشتريات - الرائد</h1>
                <h3>كيفية استخدام النظام:</h3>
                <ul>
                    <li>الصفحة الرئيسية: عرض إحصائيات النظام والموردين</li>
                    <li>إضافة فاتورة: إضافة فاتورة جديدة مع رفع الملفات</li>
                    <li>عرض الفواتير: عرض وإدارة جميع الفواتير</li>
                    <li>أوامر الشراء: إدارة أوامر الشراء</li>
                </ul>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="/" class="back-btn">العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============== معالجة الأخطاء ==============

// معالج الأخطاء العامة
app.use((err, req, res, next) => {
    console.error('💥 خطأ في الخادم:', err.message);
    
    res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        error: process.env.NODE_ENV === 'development' ? err.message : 'خطأ داخلي'
    });
});

// معالج 404
app.use((req, res) => {
    console.log(`🔍 صفحة غير موجودة: ${req.path}`);
    
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API endpoint غير موجود'
        });
    }
    
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - الصفحة غير موجودة</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                .error-container { background: white; padding: 50px; border-radius: 10px; display: inline-block; }
                h1 { color: #333; font-size: 3rem; margin: 0; }
                p { color: #666; font-size: 1.2rem; }
                a { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <h1>404</h1>
                <p>الصفحة غير موجودة</p>
                <a href="/">العودة للصفحة الرئيسية</a>
            </div>
        </body>
        </html>
    `);
});

// ============== تشغيل الخادم ==============

async function startServer() {
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        await initializeDatabase();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        
        app.listen(PORT, () => {
            console.log('🎉 تم تشغيل الخادم بنجاح!');
            console.log(`📡 المنفذ: ${PORT}`);
            console.log(`🌐 الموقع: https://erp-alraed.com`);
            console.log('🔗 الروابط المتاحة:');
            console.log('   - الصفحة الرئيسية: /');
            console.log('   - إضافة فاتورة: /add');
            console.log('   - عرض الفواتير: /view');
            console.log('   - أوامر الشراء: /purchase-orders');
            console.log('   - اختبار API: /api/test');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🚀 نظام إدارة المشتريات - الرائد جاهز للاستخدام!');
        });
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        console.log('⚠️ سيتم تشغيل الخادم بدون قاعدة البيانات...');
        
        app.listen(PORT, () => {
            console.log(`⚠️ الخادم يعمل على المنفذ ${PORT} (بدون قاعدة بيانات)`);
            console.log('🔧 يرجى فحص إعدادات قاعدة البيانات');
        });
    }
}

// إيقاف آمن للخادم
process.on('SIGTERM', () => {
    console.log('🛑 إيقاف الخادم بأمان...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 إيقاف الخادم بأمان...');
    process.exit(0);
});

// بدء تشغيل الخادم
startServer();

module.exports = app;
