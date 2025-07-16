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
    // السماح بملفات PDF و الصور
    const allowedTypes = /jpeg|jpg|png|pdf|gif|webp/;
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

// ============== APIs الأساسية ==============

// 🧪 API اختبار الاتصال
router.get('/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
        res.json({
            success: true,
            message: 'الخادم يعمل بنجاح!',
            database: 'متصل',
            time: result.rows[0].current_time,
            version: result.rows[0].db_version,
            system: 'ERP الرائد - الإصدار 3.2'
        });
    } catch (error) {
        console.error('خطأ في اختبار قاعدة البيانات:', error);
        res.json({
            success: true,
            message: 'الخادم يعمل بنجاح!',
            database: 'غير متصل',
            error: process.env.NODE_ENV === 'production' ? 'خطأ في قاعدة البيانات' : error.message
        });
    }
});

// 📊 API إحصائيات النظام الشاملة
router.get('/stats', async (req, res) => {
    try {
        // عدد الموردين
        const suppliersResult = await pool.query('SELECT COUNT(*) FROM suppliers');
        const suppliersCount = parseInt(suppliersResult.rows[0].count);

        // عدد الفواتير
        const invoicesResult = await pool.query('SELECT COUNT(*) FROM invoices');
        const invoicesCount = parseInt(invoicesResult.rows[0].count);

        // عدد أوامر الشراء
        const ordersResult = await pool.query('SELECT COUNT(*) FROM purchase_orders');
        const ordersCount = parseInt(ordersResult.rows[0].count);

        // إجمالي المبالغ
        const totalAmountResult = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices');
        const totalAmount = parseFloat(totalAmountResult.rows[0].total);

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

// ============== APIs الموردين ==============

// 🏢 API جلب الموردين مع إحصائياتهم المفصلة - مُحدث
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id,
                s.name,
                COUNT(DISTINCT i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_amount,
                COUNT(DISTINCT po.id) as purchase_orders_count,
                COALESCE(SUM(po.amount), 0) as purchase_orders_total,
                MAX(i.created_at) as last_invoice_date,
                s.created_at
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name
            GROUP BY s.id, s.name, s.created_at
            ORDER BY s.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        const suppliers = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            invoice_count: parseInt(row.invoice_count),
            total_amount: parseFloat(row.total_amount),
            purchase_orders_count: parseInt(row.purchase_orders_count),
            purchase_orders_total: parseFloat(row.purchase_orders_total),
            last_invoice_date: row.last_invoice_date,
            created_at: row.created_at
        }));

        res.json({
            success: true,
            data: suppliers,
            total: suppliers.length
        });
    } catch (error) {
        console.error('خطأ في جلب الموردين:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الموردين',
            data: [],
            total: 0
        });
    }
});

// 👥 API جلب قائمة الموردين للإكمال التلقائي
router.get('/suppliers', async (req, res) => {
    try {
        const { search } = req.query;
        let query = 'SELECT id, name FROM suppliers';
        let params = [];
        
        if (search) {
            query += ' WHERE name ILIKE $1';
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY name LIMIT 50';
        
        const result = await pool.query(query, params);
        
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

// ============== APIs الفواتير ==============

// 📋 API جلب جميع الفواتير مع إمكانية الفلترة
router.get('/invoices', async (req, res) => {
    try {
        const { 
            supplier_name, 
            search, 
            date_from, 
            date_to,
            limit = 100,
            offset = 0
        } = req.query;
        
        let query = `
            SELECT 
                id,
                invoice_number,
                supplier_name,
                invoice_type,
                category,
                invoice_date,
                amount_before_tax,
                tax_amount,
                total_amount,
                notes,
                file_path,
                created_at,
                updated_at
            FROM invoices
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        // فلترة حسب المورد
        if (supplier_name) {
            query += ` AND supplier_name = $${paramIndex}`;
            params.push(supplier_name);
            paramIndex++;
        }
        
        // البحث في رقم الفاتورة أو نوع الفاتورة أو الفئة
        if (search) {
            query += ` AND (invoice_number ILIKE $${paramIndex} OR invoice_type ILIKE $${paramIndex} OR category ILIKE $${paramIndex} OR notes ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // فلترة حسب التاريخ
        if (date_from) {
            query += ` AND invoice_date >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }
        
        if (date_to) {
            query += ` AND invoice_date <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }
        
        // الترتيب
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        const invoices = result.rows.map(row => ({
            id: row.id,
            invoice_number: row.invoice_number,
            supplier_name: row.supplier_name,
            invoice_type: row.invoice_type,
            category: row.category,
            invoice_date: row.invoice_date,
            amount_before_tax: parseFloat(row.amount_before_tax),
            tax_amount: parseFloat(row.tax_amount || 0),
            total_amount: parseFloat(row.total_amount),
            notes: row.notes,
            file_path: row.file_path,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        res.json({
            success: true,
            data: invoices,
            total: invoices.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفواتير',
            data: [],
            total: 0
        });
    }
});

// 📋 API جلب أحدث الفواتير
router.get('/recent-invoices', async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        
        const query = `
            SELECT 
                id,
                invoice_number,
                supplier_name,
                total_amount,
                invoice_date,
                created_at,
                invoice_type,
                category
            FROM invoices
            ORDER BY created_at DESC
            LIMIT $1
        `;
        
        const result = await pool.query(query, [parseInt(limit)]);
        
        const invoices = result.rows.map(row => ({
            id: row.id,
            invoice_number: row.invoice_number,
            supplier_name: row.supplier_name,
            total_amount: parseFloat(row.total_amount),
            invoice_date: row.invoice_date,
            created_at: row.created_at,
            invoice_type: row.invoice_type,
            category: row.category
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
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب ملؤها'
            });
        }

        // التحقق من صحة المبالغ
        const amountBeforeTaxNum = parseFloat(amountBeforeTax);
        const taxAmountNum = parseFloat(taxAmount) || 0;

        if (isNaN(amountBeforeTaxNum) || amountBeforeTaxNum < 0) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'مبلغ الفاتورة غير صحيح'
            });
        }

        // التحقق من عدم تكرار رقم الفاتورة
        const duplicateCheck = await client.query(
            'SELECT id FROM invoices WHERE invoice_number = $1',
            [invoiceNumber.trim()]
        );
        
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'رقم الفاتورة موجود مسبقاً'
            });
        }

        // إضافة المورد إذا لم يكن موجوداً
        const supplierCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplierName.trim()]
        );
        
        if (supplierCheck.rows.length === 0) {
            await client.query(
                'INSERT INTO suppliers (name) VALUES ($1)',
                [supplierName.trim()]
            );
        }

        // حساب المبلغ الإجمالي
        const totalAmount = amountBeforeTaxNum + taxAmountNum;

        // مسار الملف المرفوع
        let filePath = null;
        if (req.file) {
            filePath = req.file.filename; // حفظ اسم الملف فقط
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
            invoiceNumber.trim(),
            supplierName.trim(),
            invoiceType.trim(),
            category.trim(),
            invoiceDate,
            amountBeforeTaxNum,
            taxAmountNum,
            totalAmount,
            notes ? notes.trim() : null,
            filePath
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ الفاتورة بنجاح' + (req.file ? ' مع الملف المرفق' : ''),
            data: {
                id: insertResult.rows[0].id,
                invoice_number: invoiceNumber.trim(),
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
            message: 'حدث خطأ أثناء حفظ الفاتورة: ' + (process.env.NODE_ENV === 'production' ? 'خطأ في النظام' : error.message)
        });
    } finally {
        client.release();
    }
});

// ============== APIs أوامر الشراء ==============

// 🛒 API جلب جميع أوامر الشراء
router.get('/purchase-orders', async (req, res) => {
    try {
        const {
            supplier_name,
            status,
            date_from,
            date_to,
            search,
            limit = 100,
            offset = 0
        } = req.query;
        
        let query = `
            SELECT 
                id,
                order_number,
                supplier_name,
                description,
                amount,
                status,
                order_date,
                delivery_date,
                notes,
                file_path,
                created_at,
                updated_at
            FROM purchase_orders
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        // فلترة حسب المورد
        if (supplier_name) {
            query += ` AND supplier_name = $${paramIndex}`;
            params.push(supplier_name);
            paramIndex++;
        }
        
        // فلترة حسب الحالة
        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // البحث العام
        if (search) {
            query += ` AND (order_number ILIKE $${paramIndex} OR supplier_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // فلترة حسب التاريخ
        if (date_from) {
            query += ` AND order_date >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }
        
        if (date_to) {
            query += ` AND order_date <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }
        
        // الترتيب
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        const orders = result.rows.map(row => ({
            id: row.id,
            order_number: row.order_number,
            supplier_name: row.supplier_name,
            description: row.description,
            amount: parseFloat(row.amount),
            status: row.status || 'pending',
            order_date: row.order_date,
            delivery_date: row.delivery_date,
            notes: row.notes,
            file_path: row.file_path,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        res.json({
            success: true,
            data: orders,
            total: orders.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب أوامر الشراء:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب أوامر الشراء',
            data: []
        });
    }
});

// 🛒 API إضافة أمر شراء جديد
router.post('/purchase-orders', upload.single('orderFile'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            orderNumber,
            supplierName,
            orderDescription,
            orderAmount,
            orderDate,
            deliveryDate,
            orderStatus,
            orderNotes
        } = req.body;

        console.log('بيانات أمر الشراء المستلمة:', req.body);

        // التحقق من البيانات المطلوبة
        if (!supplierName || !orderDescription || !orderAmount || !orderDate) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب ملؤها'
            });
        }

        // إنشاء رقم أمر تلقائي إذا لم يتم تقديمه
        let finalOrderNumber = orderNumber;
        if (!finalOrderNumber || !finalOrderNumber.trim()) {
            const countResult = await client.query('SELECT COUNT(*) FROM purchase_orders');
            const orderCount = parseInt(countResult.rows[0].count) + 1;
            finalOrderNumber = orderCount.toString().padStart(4, '0');
        }

        // إضافة المورد إذا لم يكن موجوداً
        const supplierCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplierName.trim()]
        );
        
        if (supplierCheck.rows.length === 0) {
            await client.query(
                'INSERT INTO suppliers (name) VALUES ($1)',
                [supplierName.trim()]
            );
        }

        // مسار الملف المرفوع
        let filePath = null;
        if (req.file) {
            filePath = req.file.filename;
        }

        // إدراج أمر الشراء
        const insertQuery = `
            INSERT INTO purchase_orders (
                order_number,
                supplier_name,
                description,
                amount,
                status,
                order_date,
                delivery_date,
                notes,
                file_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `;
        
        const insertResult = await client.query(insertQuery, [
            finalOrderNumber,
            supplierName.trim(),
            orderDescription.trim(),
            parseFloat(orderAmount),
            orderStatus || 'pending',
            orderDate,
            deliveryDate || null,
            orderNotes ? orderNotes.trim() : null,
            filePath
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ أمر الشراء بنجاح' + (req.file ? ' مع الملف المرفق' : ''),
            data: {
                id: insertResult.rows[0].id,
                order_number: finalOrderNumber,
                amount: parseFloat(orderAmount),
                file_uploaded: !!req.file
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إضافة أمر الشراء:', error);
        
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
            message: 'حدث خطأ أثناء حفظ أمر الشراء'
        });
    } finally {
        client.release();
    }
});

// ============== APIs المدفوعات ==============

// 💰 API جلب مدفوعات مورد
router.get('/payments/:supplier_name', async (req, res) => {
    try {
        const supplierName = decodeURIComponent(req.params.supplier_name);
        
        const result = await pool.query(`
            SELECT 
                id,
                payment_date,
                amount,
                payment_method,
                reference_number,
                notes,
                created_at
            FROM payments
            WHERE supplier_name = $1
            ORDER BY payment_date DESC
        `, [supplierName]);
        
        const payments = result.rows.map(row => ({
            id: row.id,
            payment_date: row.payment_date,
            amount: parseFloat(row.amount),
            payment_method: row.payment_method,
            reference_number: row.reference_number,
            notes: row.notes,
            created_at: row.created_at
        }));

        res.json({
            success: true,
            data: payments,
            total: payments.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب المدفوعات:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب المدفوعات',
            data: []
        });
    }
});

// ============== معالجة الأخطاء ==============

// معالجة أخطاء multer
router.use((error, req, res, next) => {
    console.error('خطأ في API:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.json({
                success: false,
                message: 'حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت'
            });
        }
        
        return res.json({
            success: false,
            message: 'خطأ في رفع الملف'
        });
    }
    
    if (error.message.includes('نوع الملف غير مدعوم')) {
        return res.json({
            success: false,
            message: error.message
        });
    }
    
    res.json({
        success: false,
        message: 'حدث خطأ في الخادم'
    });
});

module.exports = router;
