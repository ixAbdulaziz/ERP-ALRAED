const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل نظام إدارة المشتريات - الرائد');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');

// ============== التحقق من مجلد uploads ==============
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ تم إنشاء مجلد uploads');
    } catch (error) {
        console.error('❌ خطأ في إنشاء مجلد uploads:', error.message);
    }
} else {
    console.log('✅ مجلد uploads موجود');
}

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

// تسجيل الطلبات مع معلومات إضافية
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('ar-SA');
    const userAgent = req.get('User-Agent') || 'Unknown';
    console.log(`📥 ${req.method} ${req.path} - ${timestamp} - ${req.ip} - ${userAgent.substring(0, 50)}`);
    next();
});

// ============== خدمة الملفات الثابتة ==============

// خدمة الملفات المرفوعة
app.use('/uploads', express.static(uploadsDir, {
    maxAge: '1d',
    etag: true
}));

// خدمة الملفات العامة
app.use('/public', express.static(path.join(__dirname, '../public'), {
    maxAge: '1d',
    etag: true
}));

// خدمة الملفات الثابتة من المجلد الجذر
app.use(express.static(path.join(__dirname, '../public')));

// ============== ربط APIs ==============

// ربط جميع APIs
app.use('/api', require('./routes/api'));

// ============== صفحات النظام ==============

// دالة مساعدة لإرسال الصفحات مع معالجة أفضل للأخطاء
const sendPage = (filePath) => {
    return (req, res) => {
        try {
            const fullPath = path.join(__dirname, '../views', filePath);
            
            // التحقق من وجود الملف
            if (!fs.existsSync(fullPath)) {
                console.error(`❌ الملف غير موجود: ${fullPath}`);
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html lang="ar" dir="rtl">
                    <head>
                        <meta charset="UTF-8">
                        <title>الصفحة غير موجودة</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            h1 { color: #e74c3c; }
                            a { color: #3498db; text-decoration: none; }
                        </style>
                    </head>
                    <body>
                        <h1>الصفحة غير موجودة</h1>
                        <p>الملف ${filePath} غير موجود</p>
                        <a href="/">العودة للصفحة الرئيسية</a>
                    </body>
                    </html>
                `);
            }
            
            res.sendFile(fullPath);
        } catch (error) {
            console.error(`❌ خطأ في إرسال الصفحة ${filePath}:`, error);
            res.status(500).send(`
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>خطأ في الخادم</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        h1 { color: #e74c3c; }
                        a { color: #3498db; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <h1>خطأ في تحميل الصفحة</h1>
                    <p>حدث خطأ في تحميل الصفحة، يرجى المحاولة مرة أخرى</p>
                    <a href="/">العودة للصفحة الرئيسية</a>
                </body>
                </html>
            `);
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

// صفحة اختبار الاتصال
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'الخادم يعمل بنجاح!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: process.env.NODE_ENV || 'development'
    });
});

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
                .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .error { background: #ffe8e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>مساعدة نظام إدارة المشتريات - الرائد</h1>
                
                <div class="status">
                    <h3>✅ حالة النظام</h3>
                    <p>الخادم يعمل بنجاح - ${new Date().toLocaleString('ar-SA')}</p>
                </div>

                <h3>🔗 صفحات النظام:</h3>
                <ul>
                    <li><a href="/">الصفحة الرئيسية</a> - عرض إحصائيات النظام والموردين</li>
                    <li><a href="/add">إضافة فاتورة</a> - إضافة فاتورة جديدة مع رفع الملفات</li>
                    <li><a href="/view">عرض الفواتير</a> - عرض وإدارة جميع الفواتير</li>
                    <li><a href="/purchase-orders">أوامر الشراء</a> - إدارة أوامر الشراء</li>
                </ul>

                <h3>🔧 APIs المتاحة:</h3>
                <ul>
                    <li><a href="/api/test">/api/test</a> - اختبار الاتصال</li>
                    <li><a href="/api/stats">/api/stats</a> - إحصائيات النظام</li>
                    <li><a href="/api/suppliers-with-stats">/api/suppliers-with-stats</a> - الموردين مع الإحصائيات</li>
                    <li><a href="/api/recent-invoices">/api/recent-invoices</a> - أحدث الفواتير</li>
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
    console.error('📍 Stack:', err.stack);
    
    // تسجيل تفاصيل الطلب عند حدوث خطأ
    console.error('🔍 تفاصيل الطلب:', {
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query,
        headers: req.headers
    });
    
    res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        error: process.env.NODE_ENV === 'development' ? err.message : 'خطأ داخلي',
        timestamp: new Date().toISOString()
    });
});

// معالج 404 مع معلومات مفيدة
app.use((req, res) => {
    console.log(`🔍 صفحة غير موجودة: ${req.method} ${req.path}`);
    
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API endpoint غير موجود',
            path: req.path,
            method: req.method,
            availableAPIs: [
                '/api/test',
                '/api/stats',
                '/api/suppliers-with-stats',
                '/api/recent-invoices',
                '/api/invoices',
                '/api/purchase-orders'
            ]
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
                a { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 5px; display: inline-block; }
                .links { margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <h1>404</h1>
                <p>الصفحة غير موجودة</p>
                <p>المسار المطلوب: <code>${req.path}</code></p>
                <div class="links">
                    <a href="/">الصفحة الرئيسية</a>
                    <a href="/add">إضافة فاتورة</a>
                    <a href="/view">عرض الفواتير</a>
                    <a href="/purchase-orders">أوامر الشراء</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============== تشغيل الخادم ==============

async function startServer() {
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        
        // التحقق من متغير قاعدة البيانات
        if (!process.env.DATABASE_URL) {
            console.error('❌ متغير DATABASE_URL غير موجود!');
            console.log('📝 يرجى إضافة DATABASE_URL في Railway Variables');
            console.log('📖 مثال: DATABASE_URL=postgresql://user:pass@host:port/dbname');
        }
        
        await initializeDatabase();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        
        app.listen(PORT, () => {
            console.log('🎉 تم تشغيل الخادم بنجاح!');
            console.log(`📡 المنفذ: ${PORT}`);
            console.log(`🌐 الموقع: ${process.env.NODE_ENV === 'production' ? 'https://erp-alraed.com' : `http://localhost:${PORT}`}`);
            console.log('🔗 الروابط المتاحة:');
            console.log('   - الصفحة الرئيسية: /');
            console.log('   - إضافة فاتورة: /add');
            console.log('   - عرض الفواتير: /view');
            console.log('   - أوامر الشراء: /purchase-orders');
            console.log('   - اختبار API: /api/test');
            console.log('   - المساعدة: /help');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🚀 نظام إدارة المشتريات - الرائد جاهز للاستخدام!');
        });
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        console.log('⚠️ سيتم تشغيل الخادم بدون قاعدة البيانات...');
        
        app.listen(PORT, () => {
            console.log(`⚠️ الخادم يعمل على المنفذ ${PORT} (بدون قاعدة بيانات)`);
            console.log('🔧 يرجى فحص إعدادات قاعدة البيانات');
            console.log('📝 تأكد من وجود DATABASE_URL في متغيرات البيئة');
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

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('💥 خطأ غير متوقع:', error);
    console.error('📍 Stack:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promise rejection غير معالج:', reason);
    console.error('📍 Promise:', promise);
    process.exit(1);
});

// بدء تشغيل الخادم
startServer();

module.exports = app;
