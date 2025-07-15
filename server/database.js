const { Pool } = require('pg');

// إعداد الاتصال بـ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // عدد الاتصالات المتزامنة
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// مراقبة اتصالات قاعدة البيانات
pool.on('connect', () => {
    console.log('🔗 اتصال جديد بقاعدة البيانات');
});

pool.on('error', (err) => {
    console.error('❌ خطأ في اتصال قاعدة البيانات:', err);
});

// اختبار الاتصال وإنشاء الجداول
async function initializeDatabase() {
    let client;
    try {
        console.log('🔄 تهيئة قاعدة البيانات...');
        console.log('🌍 البيئة:', process.env.NODE_ENV || 'development');
        
        // اختبار الاتصال
        client = await pool.connect();
        console.log('✅ تم الاتصال بـ PostgreSQL بنجاح');
        
        // فحص إصدار قاعدة البيانات
        const versionResult = await client.query('SELECT version()');
        console.log('📊 إصدار PostgreSQL:', versionResult.rows[0].version.split(' ')[1]);
        
        client.release();
        
        // إنشاء الجداول
        await createTables();
        
        // إدراج البيانات التجريبية إذا لزم الأمر
        await insertSampleDataIfNeeded();
        
        console.log('🎉 تم إنشاء وتهيئة قاعدة البيانات بنجاح!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('🔌 تأكد من أن خادم PostgreSQL يعمل');
        } else if (error.code === 'ENOTFOUND') {
            console.error('🌐 تأكد من صحة عنوان قاعدة البيانات');
        } else if (error.code === '28P01') {
            console.error('🔐 تأكد من صحة بيانات المصادقة');
        }
        
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// إنشاء الجداول مع الفهارس والقيود
async function createTables() {
    console.log('🔧 إنشاء الجداول والفهارس...');
    
    try {
        // جدول الموردين
        await pool.query(`
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

        // جدول الفواتير
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                invoice_number VARCHAR(100) NOT NULL UNIQUE,
                supplier_name VARCHAR(255) NOT NULL,
                invoice_type VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
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

        // جدول أوامر الشراء
        await pool.query(`
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
        console.log('✅ جدول أوامر الشراء (purchase_orders) جاهز');

        // جدول المدفوعات
        await pool.query(`
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

        // جدول ربط الفواتير بأوامر الشراء
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invoice_purchase_order_links (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
                purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
                linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(invoice_id, purchase_order_id)
            )
        `);
        console.log('✅ جدول ربط الفواتير بأوامر الشراء (invoice_purchase_order_links) جاهز');

        // إنشاء الفهارس لتحسين الأداء
        await createIndexes();
        
        // إنشاء الدوال والـ Triggers
        await createTriggersAndFunctions();
        
        console.log('✅ تم إنشاء جميع الجداول والفهارس والدوال بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
        throw error;
    }
}

// إنشاء الفهارس لتحسين الأداء
async function createIndexes() {
    const indexes = [
        // فهارس الفواتير
        'CREATE INDEX IF NOT EXISTS idx_invoices_supplier_name ON invoices(supplier_name)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_category ON invoices(category)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_amount ON invoices(total_amount)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at)',
        
        // فهارس المدفوعات
        'CREATE INDEX IF NOT EXISTS idx_payments_supplier_name ON payments(supplier_name)',
        'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)',
        'CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method)',
        'CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount)',
        
        // فهارس أوامر الشراء
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON purchase_orders(supplier_name)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_amount ON purchase_orders(amount)',
        
        // فهارس الموردين
        'CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)',
        'CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers(created_at)',
        
        // فهارس جدول الربط
        'CREATE INDEX IF NOT EXISTS idx_invoice_purchase_order_links_invoice_id ON invoice_purchase_order_links(invoice_id)',
        'CREATE INDEX IF NOT EXISTS idx_invoice_purchase_order_links_purchase_order_id ON invoice_purchase_order_links(purchase_order_id)',
        
        // فهارس مركبة للاستعلامات المعقدة
        'CREATE INDEX IF NOT EXISTS idx_invoices_supplier_date ON invoices(supplier_name, invoice_date)',
        'CREATE INDEX IF NOT EXISTS idx_payments_supplier_date ON payments(supplier_name, payment_date)',
        'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status ON purchase_orders(supplier_name, status)'
    ];
    
    for (const indexQuery of indexes) {
        try {
            await pool.query(indexQuery);
        } catch (error) {
            if (!error.message.includes('already exists')) {
                console.warn('تحذير في إنشاء فهرس:', error.message);
            }
        }
    }
    
    console.log('✅ تم إنشاء جميع الفهارس بنجاح');
}

// إنشاء الدوال والـ Triggers
async function createTriggersAndFunctions() {
    try {
        // دالة تحديث updated_at تلقائياً
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // إنشاء triggers للموردين
        await pool.query(`
            DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
            CREATE TRIGGER update_suppliers_updated_at 
                BEFORE UPDATE ON suppliers 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // إنشاء triggers للفواتير
        await pool.query(`
            DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
            CREATE TRIGGER update_invoices_updated_at 
                BEFORE UPDATE ON invoices 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // إنشاء triggers لأوامر الشراء
        await pool.query(`
            DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
            CREATE TRIGGER update_purchase_orders_updated_at 
                BEFORE UPDATE ON purchase_orders 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
        `);

        // دالة حساب الإجمالي تلقائياً للفواتير
        await pool.query(`
            CREATE OR REPLACE FUNCTION calculate_invoice_total()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.total_amount = NEW.amount_before_tax + COALESCE(NEW.tax_amount, 0);
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // trigger لحساب الإجمالي تلقائياً
        await pool.query(`
            DROP TRIGGER IF EXISTS calculate_invoice_total_trigger ON invoices;
            CREATE TRIGGER calculate_invoice_total_trigger 
                BEFORE INSERT OR UPDATE ON invoices 
                FOR EACH ROW 
                EXECUTE FUNCTION calculate_invoice_total();
        `);

        // دالة التحقق من التواريخ
        await pool.query(`
            CREATE OR REPLACE FUNCTION validate_dates()
            RETURNS TRIGGER AS $$
            BEGIN
                -- التحقق من أن تاريخ التسليم بعد تاريخ الأمر
                IF TG_TABLE_NAME = 'purchase_orders' AND NEW.delivery_date IS NOT NULL 
                   AND NEW.delivery_date < NEW.order_date THEN
                    RAISE EXCEPTION 'تاريخ التسليم لا يمكن أن يكون قبل تاريخ الأمر';
                END IF;
                
                -- التحقق من أن تاريخ الفاتورة ليس في المستقبل البعيد
                IF TG_TABLE_NAME = 'invoices' AND NEW.invoice_date > CURRENT_DATE + INTERVAL '1 day' THEN
                    RAISE EXCEPTION 'تاريخ الفاتورة لا يمكن أن يكون في المستقبل';
                END IF;
                
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // triggers للتحقق من التواريخ
        await pool.query(`
            DROP TRIGGER IF EXISTS validate_purchase_order_dates ON purchase_orders;
            CREATE TRIGGER validate_purchase_order_dates 
                BEFORE INSERT OR UPDATE ON purchase_orders 
                FOR EACH ROW 
                EXECUTE FUNCTION validate_dates();
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS validate_invoice_dates ON invoices;
            CREATE TRIGGER validate_invoice_dates 
                BEFORE INSERT OR UPDATE ON invoices 
                FOR EACH ROW 
                EXECUTE FUNCTION validate_dates();
        `);

        console.log('✅ تم إنشاء جميع الدوال والـ Triggers بنجاح');
        
    } catch (error) {
        console.warn('تحذير في إنشاء الدوال والـ Triggers:', error.message);
    }
}

// إدراج بيانات تجريبية إذا لزم الأمر
async function insertSampleDataIfNeeded() {
    try {
        // التحقق من وجود بيانات
        const suppliersCount = await pool.query('SELECT COUNT(*) FROM suppliers');
        const hasData = parseInt(suppliersCount.rows[0].count) > 0;
        
        if (hasData) {
            console.log('ℹ️ توجد بيانات في النظام، تجاهل إدراج البيانات التجريبية');
            return;
        }

        console.log('📝 إدراج بيانات تجريبية...');
        
        // إدراج موردين تجريبيين
        const sampleSuppliers = [
            { name: 'شركة الإمدادات الذكية', contact: 'هاتف: 0123456789', address: 'الرياض، المملكة العربية السعودية' },
            { name: 'مؤسسة التقنية المتقدمة', contact: 'هاتف: 0123456788', address: 'جدة، المملكة العربية السعودية' },
            { name: 'شركة الحلول المبتكرة', contact: 'هاتف: 0123456787', address: 'الدمام، المملكة العربية السعودية' }
        ];

        for (const supplier of sampleSuppliers) {
            try {
                await pool.query(
                    'INSERT INTO suppliers (name, contact_info, address) VALUES ($1, $2, $3)',
                    [supplier.name, supplier.contact, supplier.address]
                );
            } catch (error) {
                if (!error.message.includes('duplicate key')) {
                    console.warn('تحذير في إدراج مورد:', error.message);
                }
            }
        }

        // إدراج أوامر شراء تجريبية
        const sampleOrders = [
            {
                number: '0001',
                supplier: 'شركة الإمدادات الذكية',
                description: 'شراء معدات مكتبية متنوعة للفرع الجديد',
                amount: 15000.00,
                status: 'pending',
                notes: 'أمر شراء عاجل، مطلوب التسليم خلال أسبوع'
            },
            {
                number: '0002',
                supplier: 'مؤسسة التقنية المتقدمة',
                description: 'أجهزة كمبيوتر وملحقاتها للقسم الإداري',
                amount: 45000.00,
                status: 'approved',
                notes: 'تم اعتماد الأمر، في انتظار التسليم'
            },
            {
                number: '0003',
                supplier: 'شركة الحلول المبتكرة',
                description: 'برامج وتراخيص للنظام الجديد',
                amount: 12000.00,
                status: 'completed',
                notes: 'تم التسليم والتركيب بالكامل'
            }
        ];

        for (const order of sampleOrders) {
            try {
                await pool.query(`
                    INSERT INTO purchase_orders (order_number, supplier_name, description, amount, status, order_date, notes)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_DATE - INTERVAL '${Math.floor(Math.random() * 10)} days', $6)
                `, [order.number, order.supplier, order.description, order.amount, order.status, order.notes]);
            } catch (error) {
                if (!error.message.includes('duplicate key')) {
                    console.warn('تحذير في إدراج أمر شراء:', error.message);
                }
            }
        }

        console.log('✅ تم إدراج البيانات التجريبية بنجاح');
        
    } catch (error) {
        console.warn('تحذير في إدراج البيانات التجريبية:', error.message);
    }
}

// ============== وظائف مساعدة لقاعدة البيانات ==============

// وظيفة تنظيف قاعدة البيانات (للصيانة)
async function cleanupDatabase() {
    try {
        console.log('🧹 تنظيف قاعدة البيانات...');
        
        // حذف الملفات المرفقة التي لا تحتوي على مراجع
        await pool.query(`
            DELETE FROM invoices 
            WHERE file_path IS NOT NULL 
            AND file_path != '' 
            AND created_at < CURRENT_DATE - INTERVAL '1 year'
        `);
        
        // تحديث الإحصائيات
        await pool.query('ANALYZE');
        
        console.log('✅ تم تنظيف قاعدة البيانات');
    } catch (error) {
        console.error('خطأ في تنظيف قاعدة البيانات:', error);
    }
}

// وظيفة إنشاء نسخة احتياطية (مبسطة)
async function createBackup() {
    try {
        console.log('💾 إنشاء نسخة احتياطية...');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupData = {
            timestamp,
            suppliers: [],
            invoices: [],
            purchase_orders: [],
            payments: []
        };
        
        // جلب جميع البيانات
        const suppliers = await pool.query('SELECT * FROM suppliers ORDER BY id');
        const invoices = await pool.query('SELECT * FROM invoices ORDER BY id');
        const orders = await pool.query('SELECT * FROM purchase_orders ORDER BY id');
        const payments = await pool.query('SELECT * FROM payments ORDER BY id');
        
        backupData.suppliers = suppliers.rows;
        backupData.invoices = invoices.rows;
        backupData.purchase_orders = orders.rows;
        backupData.payments = payments.rows;
        
        console.log('✅ تم إنشاء النسخة الاحتياطية');
        return backupData;
        
    } catch (error) {
        console.error('خطأ في إنشاء النسخة الاحتياطية:', error);
        throw error;
    }
}

// وظيفة فحص سلامة قاعدة البيانات
async function checkDatabaseHealth() {
    try {
        console.log('🏥 فحص سلامة قاعدة البيانات...');
        
        const checks = {
            connection: false,
            tables: false,
            indexes: false,
            constraints: false
        };
        
        // فحص الاتصال
        const client = await pool.connect();
        checks.connection = true;
        client.release();
        
        // فحص وجود الجداول
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('suppliers', 'invoices', 'purchase_orders', 'payments', 'invoice_purchase_order_links')
        `);
        checks.tables = tablesResult.rows.length === 5;
        
        // فحص الفهارس
        const indexesResult = await pool.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename IN ('suppliers', 'invoices', 'purchase_orders', 'payments')
        `);
        checks.indexes = indexesResult.rows.length > 0;
        
        // فحص القيود
        const constraintsResult = await pool.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_schema = 'public'
        `);
        checks.constraints = constraintsResult.rows.length > 0;
        
        console.log('📊 نتائج فحص سلامة قاعدة البيانات:', checks);
        
        const isHealthy = Object.values(checks).every(check => check === true);
        console.log(isHealthy ? '✅ قاعدة البيانات سليمة' : '⚠️ توجد مشاكل في قاعدة البيانات');
        
        return { isHealthy, checks };
        
    } catch (error) {
        console.error('❌ خطأ في فحص سلامة قاعدة البيانات:', error);
        return { isHealthy: false, error: error.message };
    }
}

// وظيفة إحصائيات قاعدة البيانات
async function getDatabaseStats() {
    try {
        const stats = {};
        
        // إحصائيات الجداول
        const tableStatsResult = await pool.query(`
            SELECT 
                schemaname,
                tablename,
                n_tup_ins as inserts,
                n_tup_upd as updates,
                n_tup_del as deletes
            FROM pg_stat_user_tables 
            WHERE schemaname = 'public'
        `);
        
        stats.tables = tableStatsResult.rows;
        
        // حجم قاعدة البيانات
        const sizeResult = await pool.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        
        stats.database_size = sizeResult.rows[0].size;
        
        // عدد الاتصالات النشطة
        const connectionsResult = await pool.query(`
            SELECT count(*) as active_connections 
            FROM pg_stat_activity 
            WHERE state = 'active'
        `);
        
        stats.active_connections = parseInt(connectionsResult.rows[0].active_connections);
        
        return stats;
        
    } catch (error) {
        console.error('خطأ في جلب إحصائيات قاعدة البيانات:', error);
        return null;
    }
}

// وظيفة إغلاق اتصالات قاعدة البيانات بأمان
async function closeDatabase() {
    try {
        console.log('🔌 إغلاق اتصالات قاعدة البيانات...');
        await pool.end();
        console.log('✅ تم إغلاق جميع اتصالات قاعدة البيانات');
    } catch (error) {
        console.error('خطأ في إغلاق قاعدة البيانات:', error);
    }
}

// معالجة إشارات النظام لإغلاق قاعدة البيانات بأمان
process.on('SIGTERM', closeDatabase);
process.on('SIGINT', closeDatabase);
process.on('SIGHUP', closeDatabase);

// تصدير قاعدة البيانات والوظائف
module.exports = {
    pool,
    initializeDatabase,
    cleanupDatabase,
    createBackup,
    checkDatabaseHealth,
    getDatabaseStats,
    closeDatabase
};
