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

        // إنشاء الفهارس لتحسين الأداء
        await createIndexes();
        
        console.log('✅ تم إنشاء جميع الجداول والفهارس بنجاح');
        
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
        'CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers(created_at)'
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
    closeDatabase
};
