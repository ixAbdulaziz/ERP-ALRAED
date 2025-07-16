const { Pool } = require('pg');

// التحقق من متغير قاعدة البيانات
if (!process.env.DATABASE_URL) {
    console.error('❌ متغير DATABASE_URL غير موجود!');
    console.error('📝 يرجى إضافة DATABASE_URL في متغيرات البيئة');
    console.error('📖 مثال: DATABASE_URL=postgresql://user:pass@host:port/dbname');
    console.error('🔧 في Railway: Variables → Add Variable → DATABASE_URL');
}

// إعداد الاتصال بـ PostgreSQL مع تحسينات
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10, // تقليل عدد الاتصالات لتجنب التضارب
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    keepAlive: true,
    application_name: 'ERP-ALRAED'
});

// مراقبة اتصالات قاعدة البيانات
pool.on('connect', (client) => {
    console.log('🔗 اتصال جديد بقاعدة البيانات - PID:', client.processID);
});

pool.on('acquire', (client) => {
    console.log('📥 تم الحصول على اتصال من المجموعة - PID:', client.processID);
});

pool.on('remove', (client) => {
    console.log('📤 تم إزالة اتصال من المجموعة - PID:', client.processID);
});

pool.on('error', (err, client) => {
    console.error('❌ خطأ في اتصال قاعدة البيانات:', err.message);
    console.error('📍 Client PID:', client ? client.processID : 'غير معروف');
    
    // معالجة أخطاء الاتصال الشائعة
    if (err.code === 'ECONNREFUSED') {
        console.error('🔌 الخادم غير متاح - تأكد من تشغيل PostgreSQL');
    } else if (err.code === 'ENOTFOUND') {
        console.error('🌐 عنوان الخادم غير صحيح');
    } else if (err.code === '28P01') {
        console.error('🔐 بيانات المصادقة خاطئة');
    } else if (err.code === '3D000') {
        console.error('🗄️ قاعدة البيانات غير موجودة');
    }
});

// دالة اختبار الاتصال
async function testConnection() {
    let client;
    try {
        console.log('🔄 اختبار الاتصال بقاعدة البيانات...');
        
        if (!process.env.DATABASE_URL) {
            throw new Error('متغير DATABASE_URL غير موجود');
        }

        client = await pool.connect();
        console.log('✅ نجح الاتصال بقاعدة البيانات');
        
        // اختبار استعلام بسيط
        const result = await client.query('SELECT NOW() as current_time, version() as version');
        console.log('🕐 الوقت الحالي:', result.rows[0].current_time);
        console.log('📊 إصدار PostgreSQL:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
        
        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
        return false;
    } finally {
        if (client) client.release();
    }
}

// اختبار الاتصال وإنشاء الجداول
async function initializeDatabase() {
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');
        
        // اختبار الاتصال أولاً
        const connectionSuccess = await testConnection();
        if (!connectionSuccess) {
            throw new Error('فشل في الاتصال بقاعدة البيانات');
        }
        
        // إنشاء الجداول الأساسية فقط
        await createTables();
        
        console.log('🎉 تم إنشاء وتهيئة قاعدة البيانات بنجاح!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
        
        // معالجة أخطاء محددة
        if (error.code === 'ECONNREFUSED') {
            console.error('🔌 تأكد من أن خادم PostgreSQL يعمل');
        } else if (error.code === 'ENOTFOUND') {
            console.error('🌐 تأكد من صحة عنوان قاعدة البيانات');
        } else if (error.code === '28P01') {
            console.error('🔐 تأكد من صحة بيانات المصادقة');
        } else if (error.code === '3D000') {
            console.error('🗄️ تأكد من وجود قاعدة البيانات');
        } else if (error.message.includes('DATABASE_URL')) {
            console.error('📝 يرجى إضافة DATABASE_URL في متغيرات البيئة');
        }
        
        throw error;
    }
}

// إنشاء الجداول الأساسية (بدون فهارس معقدة)
async function createTables() {
    console.log('🔧 إنشاء الجداول الأساسية...');
    
    let client;
    try {
        client = await pool.connect();
        
        // بدء معاملة
        await client.query('BEGIN');
        
        // جدول الموردين
        await client.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                contact_info TEXT,
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول الموردين (suppliers) جاهز');

        // جدول الفواتير مع تحديثات للتوافق مع الصفحات
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                invoice_number VARCHAR(100) NOT NULL UNIQUE,
                supplier_name VARCHAR(255) NOT NULL,
                invoice_type VARCHAR(100) NOT NULL DEFAULT 'عام',
                category VARCHAR(100) NOT NULL DEFAULT 'عام',
                invoice_date DATE NOT NULL,
                amount_before_tax DECIMAL(12,2) NOT NULL CHECK (amount_before_tax >= 0),
                tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
                total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
                notes TEXT,
                file_path VARCHAR(500),
                status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'overdue')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول الفواتير (invoices) جاهز');

        // جدول أوامر الشراء - مع جميع الأعمدة المطلوبة
        await client.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(100) UNIQUE,
                supplier_name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
                status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')),
                order_date DATE DEFAULT CURRENT_DATE,
                delivery_date DATE,
                notes TEXT,
                file_path VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // التأكد من وجود جميع الأعمدة المطلوبة في جدول purchase_orders
        console.log('🔧 التحقق من أعمدة purchase_orders...');
        try {
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS delivery_date DATE
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS notes TEXT
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS order_number VARCHAR(100)
            `);
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            `);
            console.log('✅ تم التأكد من وجود جميع أعمدة purchase_orders');
        } catch (alterError) {
            console.warn('⚠️ تحذير في تعديل purchase_orders:', alterError.message);
        }
        console.log('✅ جدول أوامر الشراء (purchase_orders) جاهز');

        // جدول المدفوعات
        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                supplier_name VARCHAR(255) NOT NULL,
                payment_date DATE NOT NULL,
                amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
                payment_method VARCHAR(100) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'check', 'credit_card', 'other')),
                reference_number VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول المدفوعات (payments) جاهز');

        // إنشاء الفهارس الأساسية فقط
        await createEssentialIndexes(client);
        
        // إنشاء triggers للتحديث التلقائي
        await createTriggers(client);
        
        // إتمام المعاملة
        await client.query('COMMIT');
        console.log('✅ تم إنشاء جميع الجداول بنجاح');
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
}

// إنشاء الفهارس الأساسية فقط (لتجنب التضارب)
async function createEssentialIndexes(client) {
    console.log('🔍 إنشاء الفهارس الأساسية...');
    
    // فهارس أساسية فقط - الأكثر أهمية
    const essentialIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)',
        'CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_name)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date)'
    ];
    
    for (const indexQuery of essentialIndexes) {
        try {
            await client.query(indexQuery);
            console.log('✅ تم إنشاء فهرس أساسي');
        } catch (error) {
            if (!error.message.includes('already exists')) {
                console.warn('⚠️ تحذير في إنشاء فهرس:', error.message);
                // لا نرمي خطأ، فقط نسجل التحذير
            }
        }
    }
    
    console.log('✅ تم إنشاء الفهارس الأساسية');
}

// إنشاء triggers للتحديث التلقائي
async function createTriggers(client) {
    console.log('⚡ إنشاء triggers...');
    
    try {
        // إنشاء function للتحديث التلقائي
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // إزالة أي "trigger" قديم غير ضروري من purchase_orders
        await client.query(`
            DROP TRIGGER IF EXISTS validate_dates ON purchase_orders;
        `);

        // إنشاء function للتحقق من التواريخ (لـ invoices فقط)
        await client.query(`
            CREATE OR REPLACE FUNCTION validate_dates()
            RETURNS TRIGGER AS $$
            BEGIN
                IF TG_TABLE_NAME = 'invoices' AND NEW.invoice_date > CURRENT_DATE + INTERVAL '1 day' THEN
                    RAISE EXCEPTION 'Invoice date cannot be in the future';
                END IF;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // إنشاء triggers للجداول
        const triggers = [
            'DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers',
            'CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            'DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices',
            'CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            'DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders',
            'CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            'DROP TRIGGER IF EXISTS validate_dates ON invoices',
            'CREATE TRIGGER validate_dates BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION validate_dates()'
        ];
        
        for (const triggerQuery of triggers) {
            try {
                await client.query(triggerQuery);
            } catch (error) {
                if (!error.message.includes('already exists') && !error.message.includes('does not exist')) {
                    console.warn('⚠️ تحذير في إنشاء trigger:', error.message);
                }
            }
        }
        
        console.log('✅ تم إنشاء جميع triggers بنجاح');
        
    } catch (error) {
        console.warn('⚠️ خطأ في إنشاء triggers:', error.message);
        // لا نرمي خطأ، فقط نسجل التحذير
    }
}

// دالة للتأكد من سلامة البيانات
async function validateData() {
    try {
        console.log('🔍 فحص سلامة البيانات...');
        
        const client = await pool.connect();
        
        // التأكد من عدم وجود فواتير بدون موردين
        const orphanedInvoices = await client.query(`
            SELECT COUNT(*) as count FROM invoices i 
            WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = i.supplier_name)
        `);
        
        if (parseInt(orphanedInvoices.rows[0].count) > 0) {
            console.log(`⚠️ وجد ${orphanedInvoices.rows[0].count} فاتورة بدون مورد، سيتم إنشاء الموردين تلقائياً...`);
            
            // إنشاء الموردين المفقودين
            await client.query(`
                INSERT INTO suppliers (name)
                SELECT DISTINCT i.supplier_name
                FROM invoices i
                WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = i.supplier_name)
                ON CONFLICT (name) DO NOTHING
            `);
            
            console.log('✅ تم إنشاء الموردين المفقودين');
        }
        
        // التأكد من عدم وجود أوامر شراء بدون موردين
        const orphanedOrders = await client.query(`
            SELECT COUNT(*) as count FROM purchase_orders po 
            WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = po.supplier_name)
        `);
        
        if (parseInt(orphanedOrders.rows[0].count) > 0) {
            console.log(`⚠️ وجد ${orphanedOrders.rows[0].count} أمر شراء بدون مورد، سيتم إنشاء الموردين تلقائياً...`);
            
            // إنشاء الموردين المفقودين
            await client.query(`
                INSERT INTO suppliers (name)
                SELECT DISTINCT po.supplier_name
                FROM purchase_orders po
                WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = po.supplier_name)
                ON CONFLICT (name) DO NOTHING
            `);
            
            console.log('✅ تم إنشاء الموردين المفقودين لأوامر الشراء');
        }
        
        client.release();
        console.log('✅ فحص سلامة البيانات مكتمل');
        
    } catch (error) {
        console.error('❌ خطأ في فحص البيانات:', error.message);
        // لا نرمي خطأ، فقط نسجل الخطأ
    }
}

// وظيفة تنظيف البيانات القديمة (اختيارية)
async function cleanupOldData() {
    try {
        console.log('🧹 تنظيف البيانات القديمة...');
        
        // حذف الفواتير الملغية القديمة (أكثر من سنة)
        const result = await pool.query(`
            DELETE FROM invoices 
            WHERE status = 'cancelled' 
            AND created_at < NOW() - INTERVAL '1 year'
        `);
        
        if (result.rowCount > 0) {
            console.log(`🗑️ تم حذف ${result.rowCount} فاتورة ملغية قديمة`);
        }
        
        console.log('✅ تم تنظيف البيانات القديمة');
        
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error.message);
    }
}

// وظيفة إحصائيات قاعدة البيانات
async function getDatabaseStats() {
    try {
        const client = await pool.connect();
        
        const stats = {
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingConnections: pool.waitingCount
        };
        
        // إحصائيات الجداول
        const tableStats = await client.query(`
            SELECT 
                'suppliers' as table_name,
                COUNT(*) as row_count
            FROM suppliers
            UNION ALL
            SELECT 
                'invoices' as table_name,
                COUNT(*) as row_count
            FROM invoices
            UNION ALL
            SELECT 
                'purchase_orders' as table_name,
                COUNT(*) as row_count
            FROM purchase_orders
            UNION ALL
            SELECT 
                'payments' as table_name,
                COUNT(*) as row_count
            FROM payments
        `);
        
        stats.tables = {};
        tableStats.rows.forEach(row => {
            stats.tables[row.table_name] = parseInt(row.row_count);
        });
        
        // حجم الجداول (بشكل مبسط)
        try {
            const sizeQuery = `
                SELECT 
                    schemaname,
                    tablename,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            `;
            
            const result = await client.query(sizeQuery);
            stats.tableSizes = result.rows;
        } catch (sizeError) {
            console.warn('⚠️ لا يمكن الحصول على أحجام الجداول:', sizeError.message);
            stats.tableSizes = [];
        }
        
        client.release();
        return stats;
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات قاعدة البيانات:', error.message);
        return {
            totalConnections: 0,
            idleConnections: 0,
            waitingConnections: 0,
            tables: {},
            tableSizes: []
        };
    }
}

// وظيفة إغلاق اتصالات قاعدة البيانات بأمان
async function closeDatabase() {
    try {
        console.log('🔌 إغلاق اتصالات قاعدة البيانات...');
        
        await pool.end();
        console.log('✅ تم إغلاق جميع اتصالات قاعدة البيانات');
        
    } catch (error) {
        console.error('❌ خطأ في إغلاق قاعدة البيانات:', error.message);
    }
}

// معالجة إشارات النظام لإغلاق قاعدة البيانات بأمان
process.on('SIGTERM', async () => {
    console.log('🛑 استلام إشارة SIGTERM...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 استلام إشارة SIGINT...');
    await closeDatabase();
    process.exit(0);
});

process.on('SIGHUP', async () => {
    console.log('🛑 استلام إشارة SIGHUP...');
    await closeDatabase();
    process.exit(0);
});

// تشغيل تنظيف البيانات كل يوم (اختياري) - فقط في الإنتاج
if (process.env.NODE_ENV === 'production') {
    setInterval(cleanupOldData, 24 * 60 * 60 * 1000); // كل 24 ساعة
}

// تشغيل فحص سلامة البيانات عند بدء التشغيل
process.nextTick(() => {
    setTimeout(validateData, 10000); // بعد 10 ثواني من بدء التشغيل
});

// تصدير قاعدة البيانات والوظائف
module.exports = {
    pool,
    initializeDatabase,
    closeDatabase,
    testConnection,
    getDatabaseStats,
    cleanupOldData,
    validateData
};
