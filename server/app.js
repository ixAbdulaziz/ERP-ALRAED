const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل الخادم...');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');

// ============== إعدادات الوسائط ==============

// تمكين CORS
app.use(cors({
    origin: true,
    credentials: true
}));

// إعدادات المحلل (Parser)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// إعدادات الأمان الأساسي
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// تسجيل الطلبات في بيئة التطوير
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`📥 ${req.method} ${req.path} - ${new Date().toLocaleTimeString('ar-SA')}`);
        next();
    });
}

// ============== خدمة الملفات الثابتة ==============

// ملفات CSS و JS
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// ملفات الرفع (مع حماية أساسية)
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    setHeaders: (res, filePath) => {
        // منع تنفيذ الملفات المرفوعة
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// خدمة الملفات العامة
app.use(express.static(path.join(__dirname, '../public')));

// ============== ربط APIs ==============

// ربط جميع APIs
app.use('/api', require('./routes/api'));

// ============== صفحات النظام ==============

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/home.html'));
    } catch (error) {
        console.error('خطأ في إرسال الصفحة الرئيسية:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// 🛒 صفحة أوامر الشراء
app.get('/purchase-orders', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/purchase-orders.html'));
    } catch (error) {
        console.error('خطأ في إرسال صفحة أوامر الشراء:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// ➕ صفحة إضافة فاتورة
app.get('/add', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/add.html'));
    } catch (error) {
        console.error('خطأ في إرسال صفحة إضافة الفاتورة:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// 👁️ صفحة عرض الفواتير
app.get('/view', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../views/view.html'));
    } catch (error) {
        console.error('خطأ في إرسال صفحة عرض الفواتير:', error);
        res.status(500).send('خطأ في تحميل الصفحة');
    }
});

// 📊 صفحة التقارير (للمستقبل)
app.get('/reports', (req, res) => {
    res.send(`
        <div style="text-align: center; font-family: Cairo, Arial; padding: 50px; direction: rtl;">
            <h1>📊 صفحة التقارير</h1>
            <p>هذه الصفحة قيد التطوير في المراحل القادمة</p>
            <a href="/" style="color: #007bff; text-decoration: none;">← العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// 📁 صفحة إدارة الملفات (للمستقبل)
app.get('/files', (req, res) => {
    res.send(`
        <div style="text-align: center; font-family: Cairo, Arial; padding: 50px; direction: rtl;">
            <h1>📁 إدارة الملفات</h1>
            <p>هذه الصفحة قيد التطوير في المراحل القادمة</p>
            <a href="/" style="color: #007bff; text-decoration: none;">← العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// ⚙️ صفحة الإعدادات (للمستقبل)
app.get('/settings', (req, res) => {
    res.send(`
        <div style="text-align: center; font-family: Cairo, Arial; padding: 50px; direction: rtl;">
            <h1>⚙️ الإعدادات</h1>
            <p>هذه الصفحة قيد التطوير في المراحل القادمة</p>
            <a href="/" style="color: #007bff; text-decoration: none;">← العودة للصفحة الرئيسية</a>
        </div>
    `);
});

// ============== صفحات المساعدة ==============

// ❓ صفحة المساعدة
app.get('/help', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>المساعدة - نظام الرائد</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body { 
                    font-family: 'Cairo', sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh; 
                    margin: 0; 
                    padding: 20px;
                }
                .container { 
                    max-width: 800px; 
                    margin: 0 auto; 
                    background: white; 
                    border-radius: 20px; 
                    padding: 40px; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                h1 { color: #667eea; text-align: center; margin-bottom: 30px; }
                .help-section { margin-bottom: 25px; padding: 20px; background: #f8f9fa; border-radius: 10px; }
                .help-section h3 { color: #333; margin-bottom: 15px; }
                .help-section p { line-height: 1.6; color: #666; }
                a { color: #667eea; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❓ مساعدة نظام إدارة المشتريات</h1>
                
                <div class="help-section">
                    <h3>🏠 الصفحة الرئيسية</h3>
                    <p>تعرض إحصائيات شاملة عن النظام، الموردين، والفواتير. يمكنك البحث عن الموردين ومشاهدة أحدث الفواتير المضافة.</p>
                </div>
                
                <div class="help-section">
                    <h3>➕ إضافة فاتورة</h3>
                    <p>يمكنك إضافة فاتورة جديدة عبر ملء النموذج المخصص. النظام يدعم رفع ملفات PDF والصور، وحساب الضرائب تلقائياً.</p>
                </div>
                
                <div class="help-section">
                    <h3>👁️ عرض الفواتير</h3>
                    <p>صفحة شاملة لإدارة الموردين وفواتيرهم. يمكنك البحث، التصفية، التحرير، والحذف. كما يمكنك تثبيت الموردين المهمين.</p>
                </div>
                
                <div class="help-section">
                    <h3>🛒 أوامر الشراء</h3>
                    <p>إدارة أوامر الشراء وربطها بالفواتير. هذه الميزة قيد التطوير في المراحل القادمة.</p>
                </div>
                
                <div class="help-section">
                    <h3>💡 نصائح الاستخدام</h3>
                    <p>• استخدم أرقام فواتير فريدة لتجنب التكرار<br>
                    • ارفع ملفات الفواتير لسهولة الرجوع إليها<br>
                    • استخدم ميزة التثبيت للموردين المهمين<br>
                    • تأكد من دقة البيانات المالية قبل الحفظ</p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="/">← العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 📱 معلومات النظام
app.get('/about', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>حول النظام - نظام الرائد</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body { 
                    font-family: 'Cairo', sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh; 
                    margin: 0; 
                    padding: 20px;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white; 
                    border-radius: 20px; 
                    padding: 40px; 
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                h1 { color: #667eea; margin-bottom: 20px; }
                .version { background: #667eea; color: white; padding: 10px 20px; border-radius: 20px; display: inline-block; margin: 20px 0; }
                .features { text-align: right; margin: 30px 0; }
                .features li { margin: 10px 0; color: #666; }
                a { color: #667eea; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 نظام إدارة المشتريات - الرائد</h1>
                <div class="version">الإصدار 3.0.0 - Chapter 3</div>
                
                <p style="color: #666; line-height: 1.6;">
                    نظام شامل لإدارة المشتريات والموردين، مطور خصيصاً لتسهيل عمليات متابعة الفواتير والمدفوعات بطريقة احترافية ومنظمة.
                </p>
                
                <div class="features">
                    <h3 style="color: #333;">المميزات الحالية:</h3>
                    <ul>
                        <li>✅ إدارة شاملة للموردين</li>
                        <li>✅ إضافة وتحرير الفواتير</li>
                        <li>✅ رفع ومعاينة المرفقات</li>
                        <li>✅ البحث والتصفية المتقدمة</li>
                        <li>✅ تثبيت الموردين المهمين</li>
                        <li>✅ تصدير البيانات لـ Excel</li>
                        <li>✅ حساب الضرائب التلقائي</li>
                        <li>✅ إحصائيات مالية شاملة</li>
                    </ul>
                </div>
                
                <div style="margin-top: 30px; color: #999; font-size: 0.9rem;">
                    مطور بـ Node.js + PostgreSQL + Bootstrap<br>
                    تم التطوير في يوليو 2025
                </div>
                
                <div style="margin-top: 20px;">
                    <a href="/">← العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============== معالجة الأخطاء ==============

// معالج الأخطاء العامة
app.use((err, req, res, next) => {
    console.error('💥 خطأ في الخادم:', err.stack);
    
    // خطأ رفع الملفات
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت'
        });
    }
    
    // خطأ في المحلل
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'خطأ في تنسيق البيانات المرسلة'
        });
    }
    
    // خطأ عام
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'حدث خطأ في الخادم' 
            : err.message
    });
});

// معالج 404
app.use((req, res) => {
    console.log(`🔍 صفحة غير موجودة: ${req.method} ${req.path}`);
    
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - الصفحة غير موجودة</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body { 
                    font-family: 'Cairo', sans-serif; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh; 
                    margin: 0; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                }
                .error-container { 
                    text-align: center; 
                    background: white; 
                    padding: 50px; 
                    border-radius: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .error-code { font-size: 6rem; color: #667eea; font-weight: 700; margin: 0; }
                .error-message { font-size: 1.5rem; color: #333; margin: 20px 0; }
                .error-description { color: #666; margin-bottom: 30px; }
                a { 
                    background: #667eea; 
                    color: white; 
                    padding: 15px 30px; 
                    border-radius: 25px; 
                    text-decoration: none; 
                    font-weight: 600;
                    transition: all 0.3s ease;
                }
                a:hover { 
                    background: #5a67d8; 
                    transform: translateY(-2px);
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-code">404</div>
                <div class="error-message">الصفحة غير موجودة</div>
                <div class="error-description">
                    عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها
                </div>
                <a href="/">العودة للصفحة الرئيسية</a>
            </div>
        </body>
        </html>
    `);
});

// ============== تشغيل الخادم ==============

// تهيئة قاعدة البيانات وتشغيل الخادم
async function startServer() {
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        await initializeDatabase();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        
        app.listen(PORT, () => {
            console.log('🎉 تم تشغيل الخادم بنجاح!');
            console.log(`📡 المنفذ: ${PORT}`);
            console.log(`🌐 الموقع متاح على Railway`);
            console.log(`🔗 الروابط المتاحة:`);
            console.log(`   - الصفحة الرئيسية: /`);
            console.log(`   - إضافة فاتورة: /add`);
            console.log(`   - عرض الفواتير: /view`);
            console.log(`   - أوامر الشراء: /purchase-orders`);
            console.log(`   - المساعدة: /help`);
            console.log(`   - حول النظام: /about`);
            console.log(`   - اختبار API: /api/test`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        console.log('⚠️ سيتم تشغيل الخادم بدون قاعدة البيانات...');
        
        // تشغيل الخادم حتى لو فشلت قاعدة البيانات
        app.listen(PORT, () => {
            console.log(`⚠️ الخادم يعمل على المنفذ ${PORT} (بدون قاعدة بيانات)`);
            console.log('🔧 يرجى فحص إعدادات قاعدة البيانات');
        });
    }
}

// إيقاف آمن للخادم
process.on('SIGTERM', () => {
    console.log('🛑 إيقاف الخادم...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 إيقاف الخادم...');
    process.exit(0);
});

// بدء تشغيل الخادم
startServer();

module.exports = app;
