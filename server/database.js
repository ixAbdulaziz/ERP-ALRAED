const { Pool } = require('pg');

// إعداد الاتصال بـ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// اختبار الاتصال وإنشاء الجداول
async function initializeDatabase() {
    try {
        console.log('🔗 محاولة الاتصال بـ PostgreSQL...');
        
        // اختبار الاتصال
        const client = await pool.connect();
        console.log('✅ تم الاتصال بـ PostgreSQL بنجاح');
        client.release();
        
        // إنشاء الجداول
        await createTables();
        console.log('🎉 تم إنشاء جميع الجداول بنجاح - قاعدة البيانات جاهزة للاستخدام!');
        
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
        process.exit(1);
    }
}

// إنشاء الجداول
async function createTables() {
    console.log('🔧 إنشاء الجداول...');
    
    try {
        // جدول الموردين
        await pool.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول الموردين جاهز');

        // جدول الفواتير
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                invoice_number VARCHAR(100) NOT NULL UNIQUE,
                supplier_name VARCHAR(255) NOT NULL,
                invoice_type VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                invoice_date DATE NOT NULL,
                amount_before_tax DECIMAL(12,2) NOT NULL,
                tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_amount DECIMAL(12,2) NOT NULL,
                notes TEXT,
                file_path VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول الفواتير جاهز');

        // جدول أوامر الشراء
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                supplier_name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول أوامر الشراء جاهز');
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
        throw error;
    }
}

// وظائف مساعدة لقاعدة البيانات

// جلب جميع الموردين
async function getAllSuppliers() {
    try {
        const result = await pool.query('SELECT * FROM suppliers ORDER BY name');
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب الموردين:', error);
        throw error;
    }
}

// جلب جميع الفواتير
async function getAllInvoices() {
    try {
        const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        throw error;
    }
}

// جلب إحصائيات النظام
async function getStats() {
    try {
        const stats = {};
        
        // عدد الموردين
        const suppliersResult = await pool.query('SELECT COUNT(*) as count FROM suppliers');
        stats.suppliersCount = parseInt(suppliersResult.rows[0].count);
        
        // عدد الفواتير
        const invoicesResult = await pool.query('SELECT COUNT(*) as count FROM invoices');
        stats.invoicesCount = parseInt(invoicesResult.rows[0].count);
        
        // عدد أوامر الشراء
        const ordersResult = await pool.query('SELECT COUNT(*) as count FROM purchase_orders');
        stats.ordersCount = parseInt(ordersResult.rows[0].count);
        
        // إجمالي المبالغ المستحقة
        const totalResult = await pool.query('SELECT SUM(amount_before_tax) as total FROM invoices');
        stats.totalAmount = parseFloat(totalResult.rows[0].total) || 0;
        
        return stats;
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        throw error;
    }
}

// جلب أحدث 5 فواتير
async function getRecentInvoices() {
    try {
        const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 5');
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب أحدث الفواتير:', error);
        throw error;
    }
}

// جلب بيانات الموردين مع إحصائياتهم
async function getSuppliersWithStats() {
    try {
        const result = await pool.query(`
            SELECT 
                s.name,
                COUNT(i.id) as invoice_count,
                COALESCE(SUM(i.amount_before_tax), 0) as total_amount
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            GROUP BY s.name
            ORDER BY s.name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            invoice_count: parseInt(row.invoice_count),
            total_amount: parseFloat(row.total_amount)
        }));
    } catch (error) {
        console.error('خطأ في جلب الموردين مع الإحصائيات:', error);
        throw error;
    }
}

// جلب جميع أوامر الشراء
async function getAllPurchaseOrders() {
    try {
        const result = await pool.query('SELECT * FROM purchase_orders ORDER BY created_at DESC');
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب أوامر الشراء:', error);
        throw error;
    }
}

// إضافة مورد جديد
async function addSupplier(name) {
    try {
        const result = await pool.query(
            'INSERT INTO suppliers (name) VALUES ($1) RETURNING *',
            [name]
        );
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة مورد:', error);
        throw error;
    }
}

// إضافة فاتورة جديدة
async function addInvoice(invoiceData) {
    try {
        const {
            invoice_number,
            supplier_name,
            invoice_type,
            category,
            invoice_date,
            amount_before_tax,
            tax_amount,
            total_amount,
            notes,
            file_path
        } = invoiceData;
        
        const result = await pool.query(`
            INSERT INTO invoices 
            (invoice_number, supplier_name, invoice_type, category, invoice_date, 
             amount_before_tax, tax_amount, total_amount, notes, file_path) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING *
        `, [
            invoice_number,
            supplier_name,
            invoice_type,
            category,
            invoice_date,
            amount_before_tax,
            tax_amount || 0,
            total_amount,
            notes || '',
            file_path || ''
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة فاتورة:', error);
        throw error;
    }
}

// إضافة أمر شراء جديد
async function addPurchaseOrder(orderData) {
    try {
        const { supplier_name, description, amount } = orderData;
        
        const result = await pool.query(
            'INSERT INTO purchase_orders (supplier_name, description, amount) VALUES ($1, $2, $3) RETURNING *',
            [supplier_name, description, amount]
        );
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة أمر شراء:', error);
        throw error;
    }
}

// حذف فاتورة
async function deleteInvoice(id) {
    try {
        const result = await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
        return result.rowCount > 0;
    } catch (error) {
        console.error('خطأ في حذف فاتورة:', error);
        throw error;
    }
}

// حذف أمر شراء
async function deletePurchaseOrder(id) {
    try {
        const result = await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
        return result.rowCount > 0;
    } catch (error) {
        console.error('خطأ في حذف أمر شراء:', error);
        throw error;
    }
}

// تهيئة قاعدة البيانات عند بدء التشغيل
initializeDatabase();

// تصدير قاعدة البيانات والوظائف
module.exports = {
    pool,
    getAllSuppliers,
    getAllInvoices,
    getStats,
    getRecentInvoices,
    getSuppliersWithStats,
    getAllPurchaseOrders,
    addSupplier,
    addInvoice,
    addPurchaseOrder,
    deleteInvoice,
    deletePurchaseOrder
};
