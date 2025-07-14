const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../database');

// إعداد multer لرفع الملفات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../uploads');
        
        // التأكد من وجود مجلد uploads
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // إنشاء اسم ملف فريد
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const extension = path.extname(originalName);
        const baseName = path.basename(originalName, extension);
        
        cb(null, `${baseName}-${uniqueSuffix}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // السماح بملفات PDF و الصور فقط
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم. الرجاء رفع ملفات PDF أو صور فقط.'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // حد أقصى 5 ميجابايت
    },
    fileFilter: fileFilter
});

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

// ➕ API إضافة فاتورة جديدة مع رفع الملفات
router.post('/invoices', upload.single('invoiceFile'), async (req, res) => {
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
        console.log('الملف المرفوع:', req.file ? req.file.filename : 'لا يوجد ملف');

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

        // مسار الملف المرفوع
        let filePath = null;
        if (req.file) {
            filePath = `/uploads/${req.file.filename}`;
        }

        // إدراج الفاتورة
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
                notes,
                file_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            notes || null,
            filePath
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ الفاتورة بنجاح' + (req.file ? ' مع الملف المرفق' : ''),
            data: {
                id: insertResult.rows[0].id,
                invoice_number: invoiceNumber,
                total_amount: totalAmount,
                file_uploaded: !!req.file
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إضافة الفاتورة:', error);
        
        // حذف الملف المرفوع في حالة الخطأ
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('خطأ في حذف الملف:', unlinkError);
            }
        }
        
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حفظ الفاتورة: ' + error.message
        });
    } finally {
        client.release();
    }
});

// معالجة الأخطاء العامة
router.use((error, req, res, next) => {
    console.error('خطأ في API:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت'
            });
        }
    }
    
    res.json({
        success: false,
        message: 'حدث خطأ في الخادم'
    });
});

module.exports = router;
