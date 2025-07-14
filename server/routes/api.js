const express = require('express');
const router = express.Router();
const {
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
router.post('/suppliers', async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'اسم المورد مطلوب'
            });
        }
        
        const supplier = await addSupplier(name.trim());
        console.log('✅ تم إضافة مورد جديد:', name);
        
        res.json({
            success: true,
            message: 'تم إضافة المورد بنجاح',
            data: supplier
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة مورد:', error);
        
        if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
            return res.status(400).json({
                success: false,
                message: 'اسم المورد موجود مسبقاً'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة المورد',
            error: error.message
        });
    }
});

// إضافة فاتورة جديدة
router.post('/invoices', async (req, res) => {
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
        } = req.body;
        
        // التحقق من البيانات المطلوبة
        if (!invoice_number || !supplier_name || !invoice_type || !category || !invoice_date || !amount_before_tax || !total_amount) {
            return res.status(400).json({
                success: false,
                message: 'جميع البيانات الأساسية مطلوبة'
            });
        }
        
        const invoice = await addInvoice({
            invoice_number,
            supplier_name,
            invoice_type,
            category,
            invoice_date,
            amount_before_tax: parseFloat(amount_before_tax),
            tax_amount: parseFloat(tax_amount) || 0,
            total_amount: parseFloat(total_amount),
            notes,
            file_path
        });
        
        console.log('✅ تم إضافة فاتورة جديدة:', invoice_number);
        
        res.json({
            success: true,
            message: 'تم إضافة الفاتورة بنجاح',
            data: invoice
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة فاتورة:', error);
        
        if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
            return res.status(400).json({
                success: false,
                message: 'رقم الفاتورة موجود مسبقاً'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة الفاتورة',
            error: error.message
        });
    }
});

// إضافة أمر شراء جديد
router.post('/purchase-orders', async (req, res) => {
    try {
        const { supplier_name, description, amount } = req.body;
        
        if (!supplier_name || !description || !amount) {
            return res.status(400).json({
                success: false,
                message: 'جميع البيانات مطلوبة'
            });
        }
        
        const order = await addPurchaseOrder({
            supplier_name,
            description,
            amount: parseFloat(amount)
        });
        
        console.log('✅ تم إضافة أمر شراء جديد');
        
        res.json({
            success: true,
            message: 'تم إضافة أمر الشراء بنجاح',
            data: order
        });
    } catch (error) {
        console.error('❌ خطأ في إضافة أمر شراء:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة أمر الشراء',
            error: error.message
        });
    }
});

// ===== APIs للحذف والتعديل =====

// حذف فاتورة
router.delete('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const deleted = await deleteInvoice(id);
        
        if (!deleted) {
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
    } catch (error) {
        console.error('❌ خطأ في حذف فاتورة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الفاتورة',
            error: error.message
        });
    }
});

// حذف أمر شراء
router.delete('/purchase-orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const deleted = await deletePurchaseOrder(id);
        
        if (!deleted) {
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
    } catch (error) {
        console.error('❌ خطأ في حذف أمر شراء:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف أمر الشراء',
            error: error.message
        });
    }
});

// اختبار الاتصال
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'APIs تعمل بنجاح مع PostgreSQL!',
        database: 'PostgreSQL',
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
