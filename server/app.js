const express = require('express');
const path = require('path');
const cors = require('cors');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 بدء تشغيل نظام إدارة المشتريات - الرائد');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');
console.log('🔧 إصدار النظام: 3.1.0');

// ============== إعدادات الوسائط ==============

// تمكين CORS مع إعدادات محسنة
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 
        ['https://erp-alraed.com', 'https://www.erp-alraed.com'] : 
        true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// إعدادات المحلل (Parser) محسنة
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 1000
}));

// إعدادات الأمان المحسنة
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // إضافة إعدادات أمان إضافية في الإنتاج
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    }
    
    next();
});

// تسجيل الطلبات مع معلومات إضافية
app.use((req, res, next) => {
    const timestamp = new Date().toLocaleTimeString('ar-SA');
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ip = req.ip || req.connection.remoteAddress || 'Unknown';
    
    if (process.env.NODE_ENV !== 'production') {
        console.log(`📥 ${req.method} ${req.path} - ${timestamp} - ${ip.slice(0, 10)}`);
    }
    
    // إضافة معلومات الطلب للاستخدام في معالجة الأخطاء
    req.requestInfo = {
        method: req.method,
        path: req.path,
        timestamp,
        userAgent: userAgent.slice(0, 50),
        ip: ip.slice(0, 15)
    };
    
    next();
});

// ============== خدمة الملفات الثابتة ==============

// ملفات CSS و JS مع إعدادات cache محسنة
app.use('/css', express.static(path.join(__dirname, '../public/css'), {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

app.use('/js', express.static(path.join(__dirname, '../public/js'), {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

app.use('/images', express.static(path.join(__dirname, '../public/images'), {
    maxAge: '7d',
    etag: true,
    lastModified: true
}));

// ملفات الرفع مع حماية محسنة
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1h',
    setHeaders: (res, filePath, stat) => {
        // منع تنفيذ الملفات المرفوعة
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Download-Options', 'noopen');
        
        // إعدادات إضافية للأمان
        const ext = path.extname(filePath).toLowerCase();
        if (['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// خدمة الملفات العامة
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: '1h',
    etag: true,
    lastModified: true
}));

// ============== Middleware للأداء ==============

// ضغط الاستجابات (إذا كان متاحاً)
try {
    const compression = require('compression');
    app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
            // لا تضغط الملفات المرفوعة
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, res);
        }
    }));
    console.log('✅ تم تفعيل ضغط الاستجابات');
} catch (error) {
    console.log('ℹ️ ضغط الاستجابات غير متاح');
}

// ============== ربط APIs ==============

// ربط جميع APIs مع معالجة أخطاء محسنة
app.use('/api', (req, res, next) => {
    // إضافة معلومات API للسجلات
    if (process.env.NODE_ENV !== 'production') {
        console.log(`🔌 API Call: ${req.method} ${req.path}`);
    }
    next();
}, require('./routes/api'));

// ============== صفحات النظام ==============

// دالة مساعدة لإرسال الصفحات مع معالجة أخطاء محسنة
const sendPage = (filePath, pageName) => {
    return (req, res) => {
        try {
            const fullPath = path.join(__dirname, '../views', filePath);
            
            // التحقق من وجود الملف
            if (!require('fs').existsSync(fullPath)) {
                console.error(`❌ الملف غير موجود: ${fullPath}`);
                return res.status(404).send(generate404Page(`الصفحة ${pageName} غير موجودة`));
            }
            
            res.sendFile(fullPath);
        } catch (error) {
            console.error(`خطأ في إرسال ${pageName}:`, error);
            res.status(500).send(generate500Page(`خطأ في تحميل ${pageName}`));
        }
    };
};

// 🏠 الصفحة الرئيسية
app.get('/', sendPage('home.html', 'الصفحة الرئيسية'));

// 🛒 صفحة أوامر الشراء
app.get('/purchase-orders', sendPage('purchase-orders.html', 'أوامر الشراء'));

// ➕ صفحة إضافة فاتورة
app.get('/add', sendPage('add.html', 'إضافة فاتورة'));

// 👁️ صفحة عرض الفواتير
app.get('/view', sendPage('view.html', 'عرض الفواتير'));

// ============== صفحات إضافية ==============

// 📊 صفحة التقارير (محسنة)
app.get('/reports', (req, res) => {
    res.send(generateComingSoonPage('📊 صفحة التقارير', 'ستتمكن من عرض تقارير مفصلة عن المشتريات والموردين'));
});

// 📁 صفحة إدارة الملفات
app.get('/files', (req, res) => {
    res.send(generateComingSoonPage('📁 إدارة الملفات', 'ستتمكن من إدارة جميع الملفات المرفوعة ومعاينتها'));
});

// ⚙️ صفحة الإعدادات
app.get('/settings', (req, res) => {
    res.send(generateComingSoonPage('⚙️ الإعدادات', 'ستتمكن من تخصيص إعدادات النظام حسب احتياجاتك'));
});

// 🔄 صفحة النسخ الاحتياطي
app.get('/backup', (req, res) => {
    res.send(generateComingSoonPage('🔄 النسخ الاحتياطي', 'ستتمكن من إنشاء واستعادة النسخ الاحتياطية للبيانات'));
});

// 📈 صفحة الإحصائيات المتقدمة
app.get('/analytics', (req, res) => {
    res.send(generateComingSoonPage('📈 الإحصائيات المتقدمة', 'ستتمكن من مشاهدة تحليلات مفصلة للمشتريات والأداء'));
});

// ============== صفحات المساعدة ==============

// ❓ صفحة المساعدة محسنة
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
                    max-width: 900px; 
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
                .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
                .feature-card { background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; }
                a { color: #667eea; text-decoration: none; }
                a:hover { text-decoration: underline; }
                .back-btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 25px; margin-top: 20px; }
                .back-btn:hover { background: #5a67d8; color: white; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❓ مساعدة نظام إدارة المشتريات - الرائد</h1>
                
                <div class="help-section">
                    <h3>🏠 الصفحة الرئيسية</h3>
                    <p>تعرض إحصائيات شاملة عن النظام، الموردين، والفواتير. يمكنك البحث عن الموردين ومشاهدة أحدث الفواتير المضافة.</p>
                    <div class="feature-grid">
                        <div class="feature-card">
                            <strong>الإحصائيات المباشرة:</strong> عرض عدد الموردين والفواتير والمبالغ المستحقة
                        </div>
                        <div class="feature-card">
                            <strong>أحدث الفواتير:</strong> مشاهدة آخر 5 فواتير مضافة للنظام
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>➕ إضافة فاتورة</h3>
                    <p>يمكنك إضافة فاتورة جديدة عبر ملء النموذج المخصص. الحقول المطلوبة فقط: اسم المورد، المبلغ، والتاريخ.</p>
                    <div class="feature-grid">
                        <div class="feature-card">
                            <strong>رفع الملفات:</strong> دعم PDF والصور حتى 5 ميجابايت
                        </div>
                        <div class="feature-card">
                            <strong>حساب الضرائب:</strong> حساب تلقائي للضرائب (15%, 5%, أو بدون ضريبة)
                        </div>
                        <div class="feature-card">
                            <strong>الإكمال التلقائي:</strong> اقتراح أسماء الموردين الموجودين
                        </div>
                        <div class="feature-card">
                            <strong>التحقق الذكي:</strong> تحقق من صحة البيانات قبل الحفظ
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>👁️ عرض الفواتير</h3>
                    <p>صفحة شاملة لإدارة الموردين وفواتيرهم. يمكنك البحث، التصفية، التحرير، والحذف.</p>
                    <div class="feature-grid">
                        <div class="feature-card">
                            <strong>البحث المتقدم:</strong> بحث في جميع الحقول مع فلاتر متعددة
                        </div>
                        <div class="feature-card">
                            <strong>إدارة المدفوعات:</strong> تسجيل وتتبع المدفوعات لكل مورد
                        </div>
                        <div class="feature-card">
                            <strong>تصدير البيانات:</strong> تصدير الفواتير إلى Excel
                        </div>
                        <div class="feature-card">
                            <strong>معاينة الملفات:</strong> عرض وتحميل الملفات المرفقة
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>🛒 أوامر الشراء</h3>
                    <p>إدارة أوامر الشراء مع إمكانية ربطها بالفواتير وتتبع حالة التسليم.</p>
                    <div class="feature-grid">
                        <div class="feature-card">
                            <strong>إنشاء الأوامر:</strong> إنشاء أوامر شراء جديدة مع رفع المرفقات
                        </div>
                        <div class="feature-card">
                            <strong>تتبع الحالة:</strong> متابعة حالة الأوامر (معلق، مُعتمد، مُنجز)
                        </div>
                    </div>
                </div>
                
                <div class="help-section">
                    <h3>💡 نصائح الاستخدام</h3>
                    <ul style="color: #666; line-height: 1.8;">
                        <li>الحقول المطلوبة الوحيدة هي: اسم المورد، المبلغ، والتاريخ</li>
                        <li>يمكنك ترك رقم الفاتورة فارغاً وسيتم إنشاؤه تلقائياً</li>
                        <li>استخدم ميزة الإكمال التلقائي لتجنب تكرار أسماء الموردين</li>
                        <li>ارفع ملفات الفواتير لسهولة الرجوع إليها لاحقاً</li>
                        <li>استخدم حاسبة الضرائب لحساب الضرائب بدقة</li>
                        <li>تأكد من دقة البيانات المالية قبل الحفظ</li>
                        <li>استخدم صفحة عرض الفواتير لتتبع المدفوعات</li>
                    </ul>
                </div>
                
                <div class="help-section">
                    <h3>🔧 الدعم التقني</h3>
                    <p>إذا واجهت أي مشاكل أو كان لديك اقتراحات، يمكنك:</p>
                    <ul style="color: #666; line-height: 1.8;">
                        <li>فحص Console في المتصفح (F12) لمعرفة أي أخطاء</li>
                        <li>التأكد من اتصالك بالإنترنت</li>
                        <li>تحديث الصفحة إذا توقفت عن العمل</li>
                        <li>استخدام المتصفحات الحديثة للحصول على أفضل تجربة</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="/" class="back-btn">← العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 📱 معلومات النظام محسنة
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
                    max-width: 700px; 
                    margin: 0 auto; 
                    background: white; 
                    border-radius: 20px; 
                    padding: 40px; 
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                h1 { color: #667eea; margin-bottom: 20px; }
                .version { background: #667eea; color: white; padding: 12px 24px; border-radius: 25px; display: inline-block; margin: 20px 0; }
                .features { text-align: right; margin: 30px 0; }
                .features li { margin: 10px 0; color: #666; }
                .tech-stack { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
                .stat-card { background: #e3f2fd; padding: 15px; border-radius: 10px; }
                .stat-number { font-size: 1.5rem; font-weight: bold; color: #2196f3; }
                a { color: #667eea; text-decoration: none; }
                .back-btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 25px; margin-top: 20px; }
                .back-btn:hover { background: #5a67d8; color: white; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 نظام إدارة المشتريات - الرائد</h1>
                <div class="version">الإصدار 3.1.0 - Chapter 3 Enhanced</div>
                
                <p style="color: #666; line-height: 1.6;">
                    نظام شامل لإدارة المشتريات والموردين، مطور خصيصاً لتسهيل عمليات متابعة الفواتير والمدفوعات بطريقة احترافية ومنظمة.
                </p>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">4</div>
                        <div>صفحات رئيسية</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">15+</div>
                        <div>ميزة متقدمة</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">PostgreSQL</div>
                        <div>قاعدة بيانات</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">100%</div>
                        <div>عربي</div>
                    </div>
                </div>
                
                <div class="features">
                    <h3 style="color: #333; text-align: center;">المميزات الحالية:</h3>
                    <ul>
                        <li>✅ إدارة شاملة للموردين مع الإحصائيات</li>
                        <li>✅ إضافة وتحرير الفواتير بسهولة</li>
                        <li>✅ رفع ومعاينة المرفقات (PDF/صور)</li>
                        <li>✅ البحث والتصفية المتقدمة</li>
                        <li>✅ تتبع المدفوعات والمستحقات</li>
                        <li>✅ تصدير البيانات إلى Excel</li>
                        <li>✅ حساب الضرائب التلقائي</li>
                        <li>✅ إحصائيات مالية شاملة</li>
                        <li>✅ إدارة أوامر الشراء</li>
                        <li>✅ واجهة مستخدم متجاوبة</li>
                        <li>✅ نظام أمان متقدم</li>
                        <li>✅ معالجة أخطاء ذكية</li>
                    </ul>
                </div>
                
                <div class="tech-stack">
                    <h3 style="color: #333; margin-bottom: 15px;">التقنيات المستخدمة:</h3>
                    <p style="color: #666; line-height: 1.6;">
                        <strong>Backend:</strong> Node.js + Express.js + PostgreSQL<br>
                        <strong>Frontend:</strong> HTML5 + CSS3 + JavaScript + Bootstrap 5<br>
                        <strong>Database:</strong> PostgreSQL مع Railway Cloud<br>
                        <strong>Hosting:</strong> Railway Platform<br>
                        <strong>Security:</strong> CORS + Headers + File Protection
                    </p>
                </div>
                
                <div style="margin-top: 30px; color: #999; font-size: 0.9rem;">
                    🚀 تم التطوير في يوليو 2025<br>
                    📈 آخر تحديث: ${new Date().toLocaleDateString('ar-SA')}<br>
                    🌐 متاح على: erp-alraed.com
                </div>
                
                <div style="margin-top: 20px;">
                    <a href="/" class="back-btn">← العودة للصفحة الرئيسية</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 💻 معلومات النظام للمطورين
app.get('/system-info', (req, res) => {
    const systemInfo = {
        system: 'نظام إدارة المشتريات - الرائد',
        version: '3.1.0',
        environment: process.env.NODE_ENV || 'development',
        nodejs: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        features: [
            'إدارة الموردين',
            'إدارة الفواتير',
            'أوامر الشراء',
            'تتبع المدفوعات',
            'رفع الملفات',
            'تصدير البيانات',
            'البحث المتقدم',
            'الإحصائيات المالية'
        ]
    };
    
    res.json(systemInfo);
});

// ============== دوال مساعدة ==============

// دالة إنشاء صفحة "قريباً"
function generateComingSoonPage(title, description) {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} - نظام الرائد</title>
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
                    padding: 20px;
                }
                .container { 
                    text-align: center; 
                    background: white; 
                    padding: 50px; 
                    border-radius: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    max-width: 500px;
                }
                .icon { font-size: 4rem; margin-bottom: 20px; }
                .title { font-size: 2rem; color: #333; margin-bottom: 15px; font-weight: 600; }
                .description { color: #666; margin-bottom: 30px; line-height: 1.6; }
                .back-btn { 
                    background: #667eea; 
                    color: white; 
                    padding: 15px 30px; 
                    border-radius: 25px; 
                    text-decoration: none; 
                    font-weight: 600;
                    transition: all 0.3s ease;
                    display: inline-block;
                }
                .back-btn:hover { 
                    background: #5a67d8; 
                    transform: translateY(-2px);
                    color: white;
                }
                .coming-soon {
                    background: #fff3cd;
                    color: #856404;
                    padding: 15px;
                    border-radius: 10px;
                    margin: 20px 0;
                    border: 1px solid #ffeaa7;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">${title.split(' ')[0]}</div>
                <div class="title">${title}</div>
                <div class="description">${description}</div>
                <div class="coming-soon">
                    <strong>قريباً!</strong> هذه الميزة قيد التطوير وستكون متاحة في التحديثات القادمة.
                </div>
                <a href="/" class="back-btn">← العودة للصفحة الرئيسية</a>
            </div>
        </body>
        </html>
    `;
}

// دالة إنشاء صفحة 404
function generate404Page(message = 'الصفحة غير موجودة') {
    return `
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
                .back-btn { 
                    background: #667eea; 
                    color: white; 
                    padding: 15px 30px; 
                    border-radius: 25px; 
                    text-decoration: none; 
                    font-weight: 600;
                    transition: all 0.3s ease;
                }
                .back-btn:hover { 
                    background: #5a67d8; 
                    transform: translateY(-2px);
                    color: white;
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-code">404</div>
                <div class="error-message">${message}</div>
                <div class="error-description">
                    عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها
                </div>
                <a href="/" class="back-btn">العودة للصفحة الرئيسية</a>
            </div>
        </body>
        </html>
    `;
}

// دالة إنشاء صفحة 500
function generate500Page(message = 'حدث خطأ في الخادم') {
    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>500 - خطأ في الخادم</title>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body { 
                    font-family: 'Cairo', sans-serif; 
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
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
                .error-code { font-size: 6rem; color: #dc3545; font-weight: 700; margin: 0; }
                .error-message { font-size: 1.5rem; color: #333; margin: 20px 0; }
                .error-description { color: #666; margin-bottom: 30px; }
                .back-btn { 
                    background: #dc3545; 
                    color: white; 
                    padding: 15px 30px; 
                    border-radius: 25px; 
                    text-decoration: none; 
                    font-weight: 600;
                    transition: all 0.3s ease;
                }
                .back-btn:hover { 
                    background: #c82333; 
                    transform: translateY(-2px);
                    color: white;
                }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-code">500</div>
                <div class="error-message">${message}</div>
                <div class="error-description">
                    حدث خطأ تقني مؤقت. نعتذر عن الإزعاج.
                </div>
                <a href="/" class="back-btn">العودة للصفحة الرئيسية</a>
            </div>
        </body>
        </html>
    `;
}

// ============== معالجة الأخطاء ==============

// معالج الأخطاء العامة محسن
app.use((err, req, res, next) => {
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    console.error(`💥 [${errorId}] خطأ في الخادم:`, {
        error: err.message,
        stack: err.stack,
        request: req.requestInfo,
        timestamp: new Date().toISOString()
    });
    
    // خطأ رفع الملفات
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت',
            errorId
        });
    }
    
    // خطأ في المحلل
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'خطأ في تنسيق البيانات المرسلة',
            errorId
        });
    }
    
    // خطأ في قاعدة البيانات
    if (err.code && err.code.startsWith('23')) {
        return res.status(400).json({
            success: false,
            message: 'خطأ في البيانات. تأكد من صحة المعلومات المُدخلة',
            errorId
        });
    }
    
    // خطأ عام
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى.' 
            : err.message,
        errorId: process.env.NODE_ENV === 'production' ? undefined : errorId
    });
});

// معالج 404 محسن
app.use((req, res) => {
    const logEntry = {
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
    };
    
    console.log(`🔍 [404] صفحة غير موجودة:`, logEntry);
    
    // إرسال JSON للطلبات API
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API endpoint غير موجود',
            path: req.path
        });
    }
    
    // إرسال HTML للطلبات العادية
    res.status(404).send(generate404Page());
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
            console.log(`🌐 الموقع: https://erp-alraed.com`);
            console.log(`📊 البيئة: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 الروابط المتاحة:`);
            console.log(`   - الصفحة الرئيسية: /`);
            console.log(`   - إضافة فاتورة: /add`);
            console.log(`   - عرض الفواتير: /view`);
            console.log(`   - أوامر الشراء: /purchase-orders`);
            console.log(`   - المساعدة: /help`);
            console.log(`   - حول النظام: /about`);
            console.log(`   - معلومات النظام: /system-info`);
            console.log(`   - اختبار API: /api/test`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🚀 نظام إدارة المشتريات - الرائد جاهز للاستخدام!');
        });
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error);
        console.log('⚠️ سيتم تشغيل الخادم بدون قاعدة البيانات...');
        
        // تشغيل الخادم حتى لو فشلت قاعدة البيانات
        app.listen(PORT, () => {
            console.log(`⚠️ الخادم يعمل على المنفذ ${PORT} (بدون قاعدة بيانات)`);
            console.log('🔧 يرجى فحص إعدادات قاعدة البيانات');
            console.log('📞 تواصل مع المطور لحل المشكلة');
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

process.on('uncaughtException', (error) => {
    console.error('💥 خطأ غير متوقع:', error);
    console.log('🔄 إعادة تشغيل الخادم...');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 رفض غير معالج:', reason);
    console.log('🔄 سيتم إعادة تشغيل الخادم...');
});

// بدء تشغيل الخادم
startServer();

module.exports = app;
