const express = require('express');
const router = express.Router();
const { pool } = require('../database');

// 🧪 API اختبار الاتصال
router.get('/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'الخادم يعمل بنجاح!',
            database: 'متصل',
            time: result.rows[0].current_time
        });
    } catch (error) {
        console.error('خطأ في اختبار قاعدة البيانات:', error);
        res.json({
            success: true,
            message: 'الخادم يعمل بنجاح!',
            database: 'غير متصل',
            error: error.message
        });
    }
});

// 📊 API إحصائيات النظام
router.get('/stats', async (req, res) => {
    try {
        // جلب عدد الموردين
        const suppliersResult = await pool.query('SELECT COUNT(*) FROM suppliers');
        const suppliersCount = parseInt(suppliersResult.rows[0].count);

        // جلب عدد الفواتير
        const invoicesResult = await pool.query('SELECT COUNT(*) FROM invoices');
        const invoicesCount = parseInt(invoicesResult.rows[0].count);

        // جلب عدد أوامر الشراء
        const ordersResult = await pool.query('SELECT COUNT(*) FROM purchase_orders');
        const ordersCount = parseInt(ordersResult.rows[0].count);

        // جلب إجمالي المبالغ
        const totalAmountResult = await pool.query('SELECT SUM(total_amount) as total FROM invoices');
        const totalAmount = parseFloat(totalAmountResult.rows[0].total) || 0;

        res.json({
            success: true,
            data: {
                suppliersCount,
                invoicesCount,
                ordersCount,
                totalAmount: Math.round(totalAmount * 100) / 100
            }
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            data: {
                suppliersCount: 0,
                invoicesCount: 0,
                ordersCount: 0,
                totalAmount: 0
            }
        });
    }
});

// 🏢 API جلب الموردين مع إحصائياتهم
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id,
                s.name,
                COUNT(i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_amount,
                s.created_at
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            GROUP BY s.id, s.name, s.created_at
            ORDER BY s.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        // تحويل النتائج لتنسيق مناسب
        const suppliers = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            invoice_count: parseInt(row.invoice_count),
            total_amount: parseFloat(row.total_amount),
            created_at: row.created_at
        }));

        res.json({
            success: true,
            data: suppliers
        });
    } catch (error) {
        console.error('خطأ في جلب الموردين:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الموردين',
            data: []
        });
    }
});

// 📋 API جلب أحدث الفواتير
router.get('/recent-invoices', async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                invoice_number,
                supplier_name,
                total_amount,
                invoice_date,
                created_at
            FROM invoices
            ORDER BY created_at DESC
            LIMIT 5
        `;
        
        const result = await pool.query(query);
        
        const invoices = result.rows.map(row => ({
            id: row.id,
            invoice_number: row.invoice_number,
            supplier_name: row.supplier_name,
            total_amount: parseFloat(row.total_amount),
            invoice_date: row.invoice_date,
            created_at: row.created_at
        }));

        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفواتير',
            data: []
        });
    }
});

// 👥 API جلب قائمة الموردين للإكمال التلقائي
router.get('/suppliers', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name FROM suppliers ORDER BY name');
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('خطأ في جلب قائمة الموردين:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب قائمة الموردين',
            data: []
        });
    }
});

// ➕ API إضافة فاتورة جديدة (نسخة مبسطة بدون رفع ملفات)
router.post('/invoices', express.json(), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            invoiceNumber,
            supplierName,
            invoiceType,
            category,
            invoiceDate,
            amountBeforeTax,
            taxAmount,
            notes
        } = req.body;

        console.log('البيانات المستلمة:', req.body);

        // التحقق من البيانات المطلوبة
        if (!invoiceNumber || !supplierName || !invoiceType || !category || !invoiceDate || !amountBeforeTax) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب ملؤها'
            });
        }

        // التحقق من عدم تكرار رقم الفاتورة
        const duplicateCheck = await client.query(
            'SELECT id FROM invoices WHERE invoice_number = $1',
            [invoiceNumber]
        );
        
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'رقم الفاتورة موجود مسبقاً'
            });
        }

        // إضافة المورد إذا لم يكن موجوداً
        const supplierCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplierName]
        );
        
        if (supplierCheck.rows.length === 0) {
            await client.query(
                'INSERT INTO suppliers (name) VALUES ($1)',
                [supplierName]
            );
        }

        // حساب المبلغ الإجمالي
        const amountBeforeTaxNum = parseFloat(amountBeforeTax) || 0;
        const taxAmountNum = parseFloat(taxAmount) || 0;
        const totalAmount = amountBeforeTaxNum + taxAmountNum;

        // إدراج الفاتورة (بدون ملف)
        const insertQuery = `
            INSERT INTO invoices (
                invoice_number,
                supplier_name,
                invoice_type,
                category,
                invoice_date,
                amount_before_tax,
                tax_amount,
                total_amount,
                notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `;
        
        const insertResult = await client.query(insertQuery, [
            invoiceNumber,
            supplierName,
            invoiceType,
            category,
            invoiceDate,
            amountBeforeTaxNum,
            taxAmountNum,
            totalAmount,
            notes || null
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ الفاتورة بنجاح',
            data: {
                id: insertResult.rows[0].id,
                invoice_number: invoiceNumber,
                total_amount: totalAmount
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إضافة الفاتورة:', error);
        
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حفظ الفاتورة: ' + error.message
        });
    } finally {
        client.release();
    }
});

module.exports = router;
