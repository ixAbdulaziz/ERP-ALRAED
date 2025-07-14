const express = require('express');
const router = express.Router();
const {
    getAllSuppliers,
    getAllInvoices,
    getStats,
    getRecentInvoices,
    getSuppliersWithStats,
    getAllPurchaseOrders,
    db
} = require('../database');

// ===== APIs للحصول على البيانات =====

// جلب إحصائيات النظام للصفحة الرئيسية
router.get('/stats', async (req, res) => {
    try {
        const stats = await getStats();
        console.log('📊 تم جلب الإحصائيات:', stats);
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            error: error.message
        });
    }
});

// جلب جميع الموردين مع إحصائياتهم
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        const suppliers = await getSuppliersWithStats();
        console.log('👥 تم جلب الموردين مع الإحصائيات:', suppliers.length);
        res.json({
            success: true,
            data: suppliers
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الموردين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الموردين',
            error: error.message
        });
    }
});

// جلب أحدث 5 فواتير
router.get('/recent-invoices', async (req, res) => {
    try {
        const invoices = await getRecentInvoices();
        console.log('📄 تم جلب أحدث الفواتير:', invoices.length);
        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error('❌ خطأ في جلب أحدث الفواتير:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب أحدث الفواتير',
            error: error.message
        });
    }
});

// جلب جميع الفواتير
router.get('/invoices', async (req, res) => {
    try {
        const invoices = await getAllInvoices();
        console.log('📄 تم جلب جميع الفواتير:', invoices.length);
        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الفواتير:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الفواتير',
            error: error.message
        });
    }
});

// جلب جميع أوامر الشراء
router.get('/purchase-orders', async (req, res) => {
    try {
        const orders = await getAllPurchaseOrders();
        console.log('🛒 تم جلب أوامر الشراء:', orders.length);
        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('❌ خطأ في جلب أوامر الشراء:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب أوامر الشراء',
            error: error.message
        });
    }
});

// جلب جميع الموردين (للقوائم المنسدلة)
router.get('/suppliers', async (req, res) => {
    try {
        const suppliers = await getAllSuppliers();
        console.log('👥 تم جلب قائمة الموردين:', suppliers.length);
        res.json({
            success: true,
            data: suppliers
        });
    } catch (error) {
        console.error('❌ خطأ في جلب قائمة الموردين:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب قائمة الموردين',
            error: error.message
        });
    }
});

// ===== APIs لإضافة البيانات =====

// إضافة مورد جديد
router.post('/suppliers', (req, res) => {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'اسم المورد مطلوب'
        });
    }
    
    const stmt = db.prepare("INSERT INTO suppliers (name) VALUES (?)");
    stmt.run(name.trim(), function(err) {
        if (err) {
            console.error('❌ خطأ في إضافة مورد:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم المورد موجود مسبقاً'
                });
            }
            return res.status(500).json({
                success: false,
                message: 'خطأ في إضافة المورد',
                error: err.message
            });
        }
        
        console.log('✅ تم إضافة مورد جديد:', name);
        res.json({
            success: true,
            message: 'تم إضافة المورد بنجاح',
            data: { id: this.lastID, name: name.trim() }
        });
    });
    stmt.finalize();
});

// إضافة فاتورة جديدة
router.post('/invoices', (req, res) => {
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
    } = req.body;
    
    // التحقق من البيانات المطلوبة
    if (!invoice_number || !supplier_name || !invoice_type || !category || !invoice_date || !amount_before_tax || !total_amount) {
        return res.status(400).json({
            success: false,
            message: 'جميع البيانات الأساسية مطلوبة'
        });
    }
    
    const stmt = db.prepare(`INSERT INTO invoices 
        (invoice_number, supplier_name, invoice_type, category, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_path) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    stmt.run([
        invoice_number,
        supplier_name,
        invoice_type,
        category,
        invoice_date,
        parseFloat(amount_before_tax),
        parseFloat(tax_amount) || 0,
        parseFloat(total_amount),
        notes || '',
        file_path || ''
    ], function(err) {
        if (err) {
            console.error('❌ خطأ في إضافة فاتورة:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({
                    success: false,
                    message: 'رقم الفاتورة موجود مسبقاً'
                });
            }
            return res.status(500).json({
                success: false,
                message: 'خطأ في إضافة الفاتورة',
                error: err.message
            });
        }
        
        console.log('✅ تم إضافة فاتورة جديدة:', invoice_number);
        res.json({
            success: true,
            message: 'تم إضافة الفاتورة بنجاح',
            data: { id: this.lastID, invoice_number }
        });
    });
    stmt.finalize();
});

// إضافة أمر شراء جديد
router.post('/purchase-orders', (req, res) => {
    const { supplier_name, description, amount } = req.body;
    
    if (!supplier_name || !description || !amount) {
        return res.status(400).json({
            success: false,
            message: 'جميع البيانات مطلوبة'
        });
    }
    
    const stmt = db.prepare("INSERT INTO purchase_orders (supplier_name, description, amount) VALUES (?, ?, ?)");
    stmt.run([supplier_name, description, parseFloat(amount)], function(err) {
        if (err) {
            console.error('❌ خطأ في إضافة أمر شراء:', err);
            return res.status(500).json({
                success: false,
                message: 'خطأ في إضافة أمر الشراء',
                error: err.message
            });
        }
        
        console.log('✅ تم إضافة أمر شراء جديد');
        res.json({
            success: true,
            message: 'تم إضافة أمر الشراء بنجاح',
            data: { id: this.lastID }
        });
    });
    stmt.finalize();
});

// ===== APIs للحذف والتعديل =====

// حذف فاتورة
router.delete('/invoices/:id', (req, res) => {
    const { id } = req.params;
    
    const stmt = db.prepare("DELETE FROM invoices WHERE id = ?");
    stmt.run(id, function(err) {
        if (err) {
            console.error('❌ خطأ في حذف فاتورة:', err);
            return res.status(500).json({
                success: false,
                message: 'خطأ في حذف الفاتورة',
                error: err.message
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'الفاتورة غير موجودة'
            });
        }
        
        console.log('✅ تم حذف فاتورة:', id);
        res.json({
            success: true,
            message: 'تم حذف الفاتورة بنجاح'
        });
    });
    stmt.finalize();
});

// حذف أمر شراء
router.delete('/purchase-orders/:id', (req, res) => {
    const { id } = req.params;
    
    const stmt = db.prepare("DELETE FROM purchase_orders WHERE id = ?");
    stmt.run(id, function(err) {
        if (err) {
            console.error('❌ خطأ في حذف أمر شراء:', err);
            return res.status(500).json({
                success: false,
                message: 'خطأ في حذف أمر الشراء',
                error: err.message
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        console.log('✅ تم حذف أمر شراء:', id);
        res.json({
            success: true,
            message: 'تم حذف أمر الشراء بنجاح'
        });
    });
    stmt.finalize();
});

// اختبار الاتصال
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'APIs تعمل بنجاح!',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /api/stats - إحصائيات النظام',
            'GET /api/suppliers-with-stats - الموردين مع الإحصائيات',
            'GET /api/recent-invoices - أحدث الفواتير',
            'GET /api/invoices - جميع الفواتير',
            'GET /api/purchase-orders - جميع أوامر الشراء',
            'GET /api/suppliers - قائمة الموردين',
            'POST /api/suppliers - إضافة مورد',
            'POST /api/invoices - إضافة فاتورة',
            'POST /api/purchase-orders - إضافة أمر شراء',
            'DELETE /api/invoices/:id - حذف فاتورة',
            'DELETE /api/purchase-orders/:id - حذف أمر شراء'
        ]
    });
});

module.exports = router;
