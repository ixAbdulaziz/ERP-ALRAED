const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// مسار قاعدة البيانات
const dbPath = path.join(__dirname, '../database.sqlite');

// إنشاء اتصال بقاعدة البيانات
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
        initializeDatabase();
    }
});

// إنشاء الجداول الأساسية
function initializeDatabase() {
    console.log('🔧 إنشاء الجداول...');
    
    // جدول الموردين (مبسط)
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('خطأ في إنشاء جدول الموردين:', err);
        } else {
            console.log('✅ جدول الموردين جاهز');
        }
    });

    // جدول الفواتير (محدث حسب المتطلبات)
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        supplier_name TEXT NOT NULL,
        invoice_type TEXT NOT NULL,
        category TEXT NOT NULL,
        invoice_date DATE NOT NULL,
        amount_before_tax DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        notes TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('خطأ في إنشاء جدول الفواتير:', err);
        } else {
            console.log('✅ جدول الفواتير جاهز');
        }
    });

    // جدول أوامر الشراء (مبسط)
    db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_name TEXT NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('خطأ في إنشاء جدول أوامر الشراء:', err);
        } else {
            console.log('✅ جدول أوامر الشراء جاهز');
            console.log('🎉 تم إنشاء جميع الجداول بنجاح - قاعدة البيانات جاهزة للاستخدام!');
        }
    });
}

// وظائف مساعدة لقاعدة البيانات

// جلب جميع الموردين
function getAllSuppliers() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM suppliers ORDER BY name", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// جلب جميع الفواتير
function getAllInvoices() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM invoices ORDER BY created_at DESC`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// جلب إحصائيات النظام
function getStats() {
    return new Promise((resolve, reject) => {
        const stats = {};
        
        // عدد الموردين
        db.get("SELECT COUNT(*) as count FROM suppliers", (err, row) => {
            if (err) {
                return reject(err);
            }
            stats.suppliersCount = row.count;
            
            // عدد الفواتير
            db.get("SELECT COUNT(*) as count FROM invoices", (err, row) => {
                if (err) {
                    return reject(err);
                }
                stats.invoicesCount = row.count;
                
                // عدد أوامر الشراء
                db.get("SELECT COUNT(*) as count FROM purchase_orders", (err, row) => {
                    if (err) {
                        return reject(err);
                    }
                    stats.ordersCount = row.count;
                    
                    // إجمالي المبالغ المستحقة (بدون ضريبة)
                    db.get("SELECT SUM(amount_before_tax) as total FROM invoices", (err, row) => {
                        if (err) {
                            return reject(err);
                        }
                        stats.totalAmount = row.total || 0;
                        resolve(stats);
                    });
                });
            });
        });
    });
}

// جلب أحدث 5 فواتير
function getRecentInvoices() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 5`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// جلب بيانات الموردين مع إحصائياتهم للصفحة الرئيسية
function getSuppliersWithStats() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT 
            s.name,
            COUNT(i.id) as invoice_count,
            COALESCE(SUM(i.amount_before_tax), 0) as total_amount
        FROM suppliers s
        LEFT JOIN invoices i ON s.name = i.supplier_name
        GROUP BY s.name
        ORDER BY s.name`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// جلب جميع أوامر الشراء
function getAllPurchaseOrders() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM purchase_orders ORDER BY created_at DESC`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// تصدير قاعدة البيانات والوظائف
module.exports = {
    db,
    getAllSuppliers,
    getAllInvoices,
    getStats,
    getRecentInvoices,
    getSuppliersWithStats,
    getAllPurchaseOrders
};
