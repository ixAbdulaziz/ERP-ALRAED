const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { initializeDatabase, validateData, getDatabaseStats } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل نظام إدارة المشتريات - الرائد');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');
console.log('🔗 الدومين:', process.env.NODE_ENV === 'production' ? 'https://erp-alraed.com' : `http://localhost:${PORT}`);

// ============== التحقق من مجلد uploads ==============
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, '.gitkeep'), '');
        console.log('✅ تم إنشاء مجلد uploads مع .gitkeep');
    } catch (error) {
        console.error('❌ خطأ في إنشاء مجلد uploads:', error.message);
    }
} else {
    console.log('✅ مجلد uploads موجود');
}

// ============== إعدادات الوسائط ==============

// تمكين CORS مع إعدادات محسنة
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 
        ['https://erp-alraed.com', 'https://www.erp-alraed.com'] : 
        true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

// إعدادات المحلل (Parser) مع حدود محسنة
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 50
}));

// إعدادات الأمان المحسنة
app.use((req, res, next) => {
    // Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // CORS Headers for preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
        return res.status(200).end();
    }
    
    next();
});

// تسجيل الطلبات مع معلومات مفصلة
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('ar-SA');
    const userAgent = req.get('User-Agent') || 'Unknown';
    const method = req.method;
    const url = req.originalUrl || req.url;
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    // تسجيل مفصل للطلبات المهمة
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        console.log(`📝 ${method} ${url} - ${timestamp} - IP: ${ip} - Agent: ${userAgent.substring(0, 50)}`);
    } else {
        console.log(`📥 ${method} ${url} - ${timestamp} - ${ip}`);
    }
    
    next();
});

// ============== خدمة الملفات الثابتة ==============

// خدمة الملفات المرفوعة مع معالجة أفضل للأخطاء
app.use('/uploads', (req, res, next) => {
    // التحقق من وجود الملف
    const filePath = path.join(uploadsDir, req.path);
    
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ ملف غير موجود: ${req.path}`);
        return res.status(404).json({
            success: false,
            message: 'الملف غير موجود'
        });
    }
    
    next();
}, express.static(uploadsDir, {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // تحديد نوع المحتوى بناءً على امتداد الملف
        const ext = path.split('.').pop().toLowerCase();
        if (ext === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    }
}));

// خدمة الملفات العامة
app.use('/public', express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h',
    etag: true
}));

// خدمة الملفات الثابتة من المجلد الجذر
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '1h'
}));

// ============== ربط APIs ==============

// ربط جميع APIs مع معالجة محسنة للأخطاء
app.use('/api', (req, res, next) => {
    // إضافة timestamp للطلبات
    req.requestTime = Date.now();
    next();
}, require('./routes/api'));

// إحصائيات سريعة للـ APIs
app.use('/api', (req, res, next) => {
    const duration = Date.now() - req.requestTime;
    if (duration > 1000) {
        console.warn(`⚠️ طلب بطيء: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
    next();
});

// ============== صفحات النظام ==============

// دالة مساعدة محسنة لإرسال الصفحات
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
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>الصفحة غير موجودة - نظام الرائد</title>
                        <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
                        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
                        <style>
                            body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                            .error-card { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 50px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
                            .error-icon { font-size: 4rem; color: #e74c3c; margin-bottom: 20px; }
                            .btn-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; padding: 12px 30px; color: white; text-decoration: none; font-weight: 600; }
                        </style>
                    </head>
                    <body>
                        <div class="error-card">
                            <div class="error-icon">🔍</div>
                            <h1 class="text-danger mb-3">الصفحة غير موجودة</h1>
                            <p class="text-muted mb-4">الملف ${filePath} غير موجود في النظام</p>
                            <a href="/" class="btn-custom">العودة للصفحة الرئيسية</a>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            // إرسال الملف مع headers محسنة
            res.sendFile(fullPath, {
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
        } catch (error) {
            console.error(`❌ خطأ في إرسال الصفحة ${filePath}:`, error);
            res.status(500).send(`
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>خطأ في الخادم - نظام الرائد</title>
                    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
                    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                        .error-card { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 50px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
                        .error-icon { font-size: 4rem; color: #e74c3c; margin-bottom: 20px; }
                        .btn-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; padding: 12px 30px; color: white; text-decoration: none; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <div class="error-card">
                        <div class="error-icon">⚠️</div>
                        <h1 class="text-danger mb-3">خطأ في تحميل الصفحة</h1>
                        <p class="text-muted mb-4">حدث خطأ في تحميل الصفحة، يرجى المحاولة مرة أخرى</p>
                        <a href="/" class="btn-custom">العودة للصفحة الرئيسية</a>
                    </div>
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

// صفحة اختبار الاتصال مع معلومات النظام
app.get('/test', async (req, res) => {
    try {
        const stats = await getDatabaseStats();
        
        res.json({
            success: true,
            message: 'الخادم يعمل بنجاح!',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            memory: {
                used: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
                heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
            },
            env: process.env.NODE_ENV || 'development',
            database: stats ? 'متصل ✅' : 'غير متصل ❌',
            stats: stats || null
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'خطأ في اختبار النظام',
            error: error.message
        });
    }
});

// صفحة المساعدة المحسنة
app.get('/help', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>المساعدة - نظام الرائد</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
                .container { max-width: 900px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
                .header { text-align: center; margin-bottom: 40px; color: #333; }
                .status-good { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0; }
                .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
                .feature-card { background: #f8f9fa; padding: 20px; border-radius: 15px; border-left: 4px solid #667eea; }
                .btn-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; padding: 12px 30px; color: white; text-decoration: none; font-weight: 600; }
                .api-list { background: #f1f3f4; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .api-item { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; border-left: 3px solid #28a745; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎯 مساعدة نظام إدارة المشتريات - الرائد</h1>
                    <p class="lead">دليل شامل لاستخدام النظام</p>
                </div>
                
                <div class="status-good">
                    <h3>✅ حالة النظام</h3>
                    <p class="mb-0">الخادم يعمل بنجاح - ${new Date().toLocaleString('ar-SA')}</p>
                    <small>الإصدار: 3.2 | البيئة: ${process.env.NODE_ENV || 'development'}</small>
                </div>

                <h3>🔗 صفحات النظام:</h3>
                <div class="feature-grid">
                    <div class="feature-card">
                        <h5><i class="text-primary">🏠</i> الصفحة الرئيسية</h5>
                        <p>عرض إحصائيات النظام والموردين والفواتير الحديثة</p>
                        <a href="/" class="btn btn-sm btn-outline-primary">زيارة</a>
                    </div>
                    <div class="feature-card">
                        <h5><i class="text-success">➕</i> إضافة فاتورة</h5>
                        <p>إضافة فاتورة جديدة مع رفع الملفات والحسابات التلقائية</p>
                        <a href="/add" class="btn btn-sm btn-outline-success">زيارة</a>
                    </div>
                    <div class="feature-card">
                        <h5><i class="text-info">👁️</i> عرض الفواتير</h5>
                        <p>عرض وإدارة جميع الفواتير مع البحث والفلترة</p>
                        <a href="/view" class="btn btn-sm btn-outline-info">زيارة</a>
                    </div>
                    <div class="feature-card">
                        <h5><i class="text-warning">🛒</i> أوامر الشراء</h5>
                        <p>إدارة أوامر الشراء وربطها بالموردين</p>
                        <a href="/purchase-orders" class="btn btn-sm btn-outline-warning">زيارة</a>
                    </div>
                </div>

                <h3>🔧 APIs المتاحة:</h3>
                <div class="api-list">
                    <div class="api-item">
                        <strong>GET /api/test</strong> - اختبار الاتصال والحالة
                        <a href="/api/test" class="btn btn-sm btn-outline-primary float-end" target="_blank">تجربة</a>
                    </div>
                    <div class="api-item">
                        <strong>GET /api/stats</strong> - إحصائيات النظام
                        <a href="/api/stats" class="btn btn-sm btn-outline-primary float-end" target="_blank">تجربة</a>
                    </div>
                    <div class="api-item">
                        <strong>GET /api/suppliers-with-stats</strong> - الموردين مع الإحصائيات
                        <a href="/api/suppliers-with-stats" class="btn btn-sm btn-outline-primary float-end" target="_blank">تجربة</a>
                    </div>
                    <div class="api-item">
                        <strong>GET /api/recent-invoices</strong> - أحدث الفواتير
                        <a href="/api/recent-invoices" class="btn btn-sm btn-outline-primary float-end" target="_blank">تجربة</a>
                    </div>
                </div>

                <div class="text-center mt-4">
                    <a href="/" class="btn-custom">العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============== معالجة الأخطاء ==============

// معالج الأخطاء العامة المحسن
app.use((err, req, res, next) => {
    console.error('💥 خطأ في الخادم:', err.message);
    console.error('📍 Stack:', err.stack);
    
    // تسجيل تفاصيل الطلب عند حدوث خطأ
    console.error('🔍 تفاصيل الطلب:', {
        method: req.method,
        path: req.path,
        body: req.body && Object.keys(req.body).length > 0 ? 'موجود' : 'فارغ',
        query: req.query && Object.keys(req.query).length > 0 ? req.query : 'فارغ',
        ip: req.ip || 'غير معروف',
        userAgent: req.get('User-Agent') || 'غير معروف'
    });
    
    // إرسال استجابة مناسبة حسب نوع الطلب
    if (req.originalUrl.startsWith('/api/')) {
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في الخادم',
            error: process.env.NODE_ENV === 'development' ? err.message : 'خطأ داخلي',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>خطأ في الخادم - نظام الرائد</title>
                <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                    .error-card { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 50px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 500px; }
                    .error-icon { font-size: 4rem; color: #e74c3c; margin-bottom: 20px; }
                    .btn-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; padding: 12px 30px; color: white; text-decoration: none; font-weight: 600; }
                </style>
            </head>
            <body>
                <div class="error-card">
                    <div class="error-icon">⚠️</div>
                    <h1 class="text-danger mb-3">خطأ في الخادم</h1>
                    <p class="text-muted mb-4">حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى</p>
                    <a href="/" class="btn-custom">العودة للصفحة الرئيسية</a>
                </div>
            </body>
            </html>
        `);
    }
});

// معالج 404 محسن مع معلومات مفيدة
app.use((req, res) => {
    console.log(`🔍 صفحة غير موجودة: ${req.method} ${req.path}`);
    
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API endpoint غير موجود',
            path: req.path,
            method: req.method,
            availableAPIs: [
                'GET /api/test',
                'GET /api/stats', 
                'GET /api/suppliers-with-stats',
                'GET /api/recent-invoices',
                'GET /api/invoices',
                'POST /api/invoices',
                'GET /api/purchase-orders',
                'POST /api/purchase-orders',
                'GET /api/reports/summary'
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
            <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                .error-card { background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 50px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.1); max-width: 600px; }
                .error-number { font-size: 6rem; font-weight: 700; color: #667eea; margin-bottom: 20px; }
                .btn-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 10px; padding: 12px 25px; color: white; text-decoration: none; font-weight: 600; margin: 5px; display: inline-block; }
                .links { margin-top: 30px; }
            </style>
        </head>
        <body>
            <div class="error-card">
                <div class="error-number">404</div>
                <h1 class="text-muted mb-3">الصفحة غير موجودة</h1>
                <p class="text-muted mb-4">المسار المطلوب: <code>${req.path}</code></p>
                <div class="links">
                    <a href="/" class="btn-custom">🏠 الرئيسية</a>
                    <a href="/add" class="btn-custom">➕ إضافة فاتورة</a>
                    <a href="/view" class="btn-custom">👁️ عرض الفواتير</a>
                    <a href="/purchase-orders" class="btn-custom">🛒 أوامر الشراء</a>
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
        
        // تهيئة قاعدة البيانات
        await initializeDatabase();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        
        // تشغيل فحص سلامة البيانات بعد 10 ثواني
        setTimeout(async () => {
            try {
                await validateData();
                console.log('✅ تم فحص سلامة البيانات');
            } catch (error) {
                console.warn('⚠️ تحذير في فحص البيانات:', error.message);
            }
        }, 10000);
        
        // بدء الخادم
        app.listen(PORT, () => {
            console.log('🎉 تم تشغيل الخادم بنجاح!');
            console.log(`📡 المنفذ: ${PORT}`);
            console.log(`🌐 الموقع: ${process.env.NODE_ENV === 'production' ? 'https://erp-alraed.com' : `http://localhost:${PORT}`}`);
            console.log('🔗 الروابط المتاحة:');
            console.log('   - 🏠 الصفحة الرئيسية: /');
            console.log('   - ➕ إضافة فاتورة: /add');
            console.log('   - 👁️ عرض الفواتير: /view');
            console.log('   - 🛒 أوامر الشراء: /purchase-orders');
            console.log('   - 🧪 اختبار API: /api/test');
            console.log('   - 📊 الإحصائيات: /api/stats');
            console.log('   - ❓ المساعدة: /help');
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
