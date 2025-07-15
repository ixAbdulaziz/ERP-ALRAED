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

// ============== APIs الأساسية ==============

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

// ============== APIs الموردين ==============

// 🏢 API جلب الموردين مع إحصائياتهم
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id,
                s.name,
                COUNT(DISTINCT i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_amount,
                COUNT(DISTINCT po.id) as purchase_orders_count,
                s.created_at
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name
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
            purchase_orders_count: parseInt(row.purchase_orders_count),
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

// 🔄 API تحديث اسم مورد
router.put('/suppliers/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const supplierId = req.params.id;
        const { name } = req.body;
        
        if (!name || !name.trim()) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'اسم المورد مطلوب'
            });
        }
        
        // التحقق من عدم وجود مورد آخر بنفس الاسم
        const duplicateCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1 AND id != $2',
            [name.trim(), supplierId]
        );
        
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'يوجد مورد آخر بنفس هذا الاسم'
            });
        }
        
        // جلب الاسم القديم
        const oldSupplierResult = await client.query(
            'SELECT name FROM suppliers WHERE id = $1',
            [supplierId]
        );
        
        if (oldSupplierResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'المورد غير موجود'
            });
        }
        
        const oldName = oldSupplierResult.rows[0].name;
        
        // تحديث اسم المورد
        await client.query(
            'UPDATE suppliers SET name = $1 WHERE id = $2',
            [name.trim(), supplierId]
        );
        
        // تحديث اسم المورد في جميع الفواتير
        await client.query(
            'UPDATE invoices SET supplier_name = $1 WHERE supplier_name = $2',
            [name.trim(), oldName]
        );
        
        // تحديث اسم المورد في أوامر الشراء
        await client.query(
            'UPDATE purchase_orders SET supplier_name = $1 WHERE supplier_name = $2',
            [name.trim(), oldName]
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم تحديث اسم المورد بنجاح',
            data: {
                id: supplierId,
                old_name: oldName,
                new_name: name.trim()
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في تحديث اسم المورد:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء تحديث اسم المورد'
        });
    } finally {
        client.release();
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
                created_at
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
        
        // البحث في رقم الفاتورة أو نوع الفاتورة
        if (search) {
            query += ` AND (invoice_number ILIKE $${paramIndex} OR invoice_type ILIKE $${paramIndex})`;
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
            created_at: row.created_at
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

// 📄 API جلب فاتورة محددة
router.get('/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        
        const result = await pool.query(
            'SELECT * FROM invoices WHERE id = $1',
            [invoiceId]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: false,
                message: 'الفاتورة غير موجودة'
            });
        }
        
        const invoice = result.rows[0];
        
        res.json({
            success: true,
            data: {
                id: invoice.id,
                invoice_number: invoice.invoice_number,
                supplier_name: invoice.supplier_name,
                invoice_type: invoice.invoice_type,
                category: invoice.category,
                invoice_date: invoice.invoice_date,
                amount_before_tax: parseFloat(invoice.amount_before_tax),
                tax_amount: parseFloat(invoice.tax_amount || 0),
                total_amount: parseFloat(invoice.total_amount),
                notes: invoice.notes,
                file_path: invoice.file_path,
                created_at: invoice.created_at
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الفاتورة:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفاتورة'
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

// ✏️ API تحديث فاتورة
router.put('/invoices/:id', upload.single('invoiceFile'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const invoiceId = req.params.id;
        const {
            invoice_number,
            invoice_type,
            category,
            invoice_date,
            amount_before_tax,
            tax_amount,
            total_amount,
            notes
        } = req.body;

        // التحقق من وجود الفاتورة
        const invoiceCheck = await client.query(
            'SELECT * FROM invoices WHERE id = $1',
            [invoiceId]
        );
        
        if (invoiceCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'الفاتورة غير موجودة'
            });
        }
        
        const existingInvoice = invoiceCheck.rows[0];

        // التحقق من عدم تكرار رقم الفاتورة (إذا تم تغييره)
        if (invoice_number !== existingInvoice.invoice_number) {
            const duplicateCheck = await client.query(
                'SELECT id FROM invoices WHERE invoice_number = $1 AND id != $2',
                [invoice_number, invoiceId]
            );
            
            if (duplicateCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.json({
                    success: false,
                    message: 'رقم الفاتورة موجود مسبقاً'
                });
            }
        }

        // إعداد مسار الملف
        let filePath = existingInvoice.file_path; // الاحتفاظ بالملف الحالي
        
        if (req.file) {
            // حذف الملف القديم إذا وجد
            if (existingInvoice.file_path) {
                const oldFilePath = path.join(__dirname, '../../uploads', existingInvoice.file_path);
                try {
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (deleteError) {
                    console.log('تحذير: لم يتم حذف الملف القديم:', deleteError.message);
                }
            }
            
            filePath = req.file.filename; // الملف الجديد
        }

        // تحديث الفاتورة
        const updateQuery = `
            UPDATE invoices SET
                invoice_number = $1,
                invoice_type = $2,
                category = $3,
                invoice_date = $4,
                amount_before_tax = $5,
                tax_amount = $6,
                total_amount = $7,
                notes = $8,
                file_path = $9
            WHERE id = $10
        `;
        
        await client.query(updateQuery, [
            invoice_number,
            invoice_type,
            category,
            invoice_date,
            parseFloat(amount_before_tax),
            parseFloat(tax_amount) || 0,
            parseFloat(total_amount),
            notes || null,
            filePath,
            invoiceId
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم تحديث الفاتورة بنجاح' + (req.file ? ' مع تحديث الملف' : ''),
            data: {
                id: invoiceId,
                invoice_number: invoice_number,
                file_updated: !!req.file
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في تحديث الفاتورة:', error);
        
        // حذف الملف الجديد في حالة الخطأ
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('خطأ في حذف الملف:', unlinkError);
            }
        }
        
        res.json({
            success: false,
            message: 'حدث خطأ أثناء تحديث الفاتورة: ' + error.message
        });
    } finally {
        client.release();
    }
});

// 🗑️ API حذف فاتورة
router.delete('/invoices/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const invoiceId = req.params.id;
        
        // جلب معلومات الفاتورة قبل الحذف
        const invoiceResult = await client.query(
            'SELECT * FROM invoices WHERE id = $1',
            [invoiceId]
        );
        
        if (invoiceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'الفاتورة غير موجودة'
            });
        }
        
        const invoice = invoiceResult.rows[0];
        
        // حذف روابط الفاتورة مع أوامر الشراء أولاً
        await client.query('DELETE FROM invoice_purchase_order_links WHERE invoice_id = $1', [invoiceId]);
        
        // حذف الفاتورة من قاعدة البيانات
        await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
        
        // حذف الملف المرفق إذا وجد
        if (invoice.file_path) {
            const filePath = path.join(__dirname, '../../uploads', invoice.file_path);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (deleteError) {
                console.log('تحذير: لم يتم حذف الملف:', deleteError.message);
            }
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم حذف الفاتورة بنجاح',
            data: {
                deleted_invoice: {
                    id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    supplier_name: invoice.supplier_name
                }
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في حذف الفاتورة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حذف الفاتورة'
        });
    } finally {
        client.release();
    }
});

// ============== APIs أوامر الشراء - الجديدة ==============

// 🛒 API جلب جميع أوامر الشراء
router.get('/purchase-orders', async (req, res) => {
    try {
        const {
            supplier_name,
            status,
            date_from,
            date_to,
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
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        const orders = result.rows.map(row => ({
            id: row.id,
            order_number: row.order_number,
            supplier_name: row.supplier_name,
            description: row.description,
            amount: parseFloat(row.amount),
            status: row.status,
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

// 🛒 API جلب أمر شراء محدد
router.get('/purchase-orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        
        const result = await pool.query(
            'SELECT * FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        const order = result.rows[0];
        
        res.json({
            success: true,
            data: {
                id: order.id,
                order_number: order.order_number,
                supplier_name: order.supplier_name,
                description: order.description,
                amount: parseFloat(order.amount),
                status: order.status,
                order_date: order.order_date,
                delivery_date: order.delivery_date,
                notes: order.notes,
                file_path: order.file_path,
                created_at: order.created_at,
                updated_at: order.updated_at
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب أمر الشراء:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب أمر الشراء'
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
        console.log('الملف المرفوع:', req.file ? req.file.filename : 'لا يوجد ملف');

        // التحقق من البيانات المطلوبة
        if (!supplierName || !orderDescription || !orderAmount || !orderDate) {
            await client.query('ROLLBACK');
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
            finalOrderNumber = `PO-${orderCount.toString().padStart(4, '0')}`;
        }

        // التحقق من عدم تكرار رقم الأمر
        const duplicateCheck = await client.query(
            'SELECT id FROM purchase_orders WHERE order_number = $1',
            [finalOrderNumber]
        );
        
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'رقم أمر الشراء موجود مسبقاً'
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
            supplierName,
            orderDescription,
            parseFloat(orderAmount),
            orderStatus || 'pending',
            orderDate,
            deliveryDate || null,
            orderNotes || null,
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
            message: 'حدث خطأ أثناء حفظ أمر الشراء: ' + error.message
        });
    } finally {
        client.release();
    }
});

// ✏️ API تحديث أمر شراء
router.put('/purchase-orders/:id', upload.single('editOrderFile'), async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const orderId = req.params.id;
        const {
            editOrderNumber,
            editSupplierName,
            editOrderDescription,
            editOrderAmount,
            editOrderDate,
            editDeliveryDate,
            editOrderStatus,
            editOrderNotes
        } = req.body;

        // التحقق من وجود أمر الشراء
        const orderCheck = await client.query(
            'SELECT * FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        
        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        const existingOrder = orderCheck.rows[0];

        // التحقق من عدم تكرار رقم الأمر (إذا تم تغييره)
        if (editOrderNumber !== existingOrder.order_number) {
            const duplicateCheck = await client.query(
                'SELECT id FROM purchase_orders WHERE order_number = $1 AND id != $2',
                [editOrderNumber, orderId]
            );
            
            if (duplicateCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.json({
                    success: false,
                    message: 'رقم أمر الشراء موجود مسبقاً'
                });
            }
        }

        // إعداد مسار الملف
        let filePath = existingOrder.file_path; // الاحتفاظ بالملف الحالي
        
        if (req.file) {
            // حذف الملف القديم إذا وجد
            if (existingOrder.file_path) {
                const oldFilePath = path.join(__dirname, '../../uploads', existingOrder.file_path);
                try {
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (deleteError) {
                    console.log('تحذير: لم يتم حذف الملف القديم:', deleteError.message);
                }
            }
            
            filePath = req.file.filename; // الملف الجديد
        }

        // تحديث أمر الشراء
        const updateQuery = `
            UPDATE purchase_orders SET
                order_number = $1,
                supplier_name = $2,
                description = $3,
                amount = $4,
                status = $5,
                order_date = $6,
                delivery_date = $7,
                notes = $8,
                file_path = $9
            WHERE id = $10
        `;
        
        await client.query(updateQuery, [
            editOrderNumber,
            editSupplierName,
            editOrderDescription,
            parseFloat(editOrderAmount),
            editOrderStatus || 'pending',
            editOrderDate,
            editDeliveryDate || null,
            editOrderNotes || null,
            filePath,
            orderId
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم تحديث أمر الشراء بنجاح' + (req.file ? ' مع تحديث الملف' : ''),
            data: {
                id: orderId,
                order_number: editOrderNumber,
                file_updated: !!req.file
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في تحديث أمر الشراء:', error);
        
        // حذف الملف الجديد في حالة الخطأ
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('خطأ في حذف الملف:', unlinkError);
            }
        }
        
        res.json({
            success: false,
            message: 'حدث خطأ أثناء تحديث أمر الشراء: ' + error.message
        });
    } finally {
        client.release();
    }
});

// 🗑️ API حذف أمر شراء
router.delete('/purchase-orders/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const orderId = req.params.id;
        
        // جلب معلومات أمر الشراء قبل الحذف
        const orderResult = await client.query(
            'SELECT * FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        
        if (orderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        const order = orderResult.rows[0];
        
        // حذف روابط الفواتير مع أمر الشراء أولاً
        await client.query('DELETE FROM invoice_purchase_order_links WHERE purchase_order_id = $1', [orderId]);
        
        // حذف أمر الشراء من قاعدة البيانات
        await client.query('DELETE FROM purchase_orders WHERE id = $1', [orderId]);
        
        // حذف الملف المرفق إذا وجد
        if (order.file_path) {
            const filePath = path.join(__dirname, '../../uploads', order.file_path);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (deleteError) {
                console.log('تحذير: لم يتم حذف الملف:', deleteError.message);
            }
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم حذف أمر الشراء بنجاح',
            data: {
                deleted_order: {
                    id: order.id,
                    order_number: order.order_number,
                    supplier_name: order.supplier_name
                }
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في حذف أمر الشراء:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حذف أمر الشراء'
        });
    } finally {
        client.release();
    }
});

// ============== APIs ربط الفواتير مع أوامر الشراء ==============

// 🔗 API جلب الفواتير المرتبطة بأمر شراء محدد
router.get('/purchase-orders/:id/invoices', async (req, res) => {
    try {
        const orderId = req.params.id;
        
        const query = `
            SELECT 
                i.id,
                i.invoice_number,
                i.supplier_name,
                i.total_amount,
                i.invoice_date,
                ipl.linked_at
            FROM invoices i
            INNER JOIN invoice_purchase_order_links ipl ON i.id = ipl.invoice_id
            WHERE ipl.purchase_order_id = $1
            ORDER BY ipl.linked_at DESC
        `;
        
        const result = await pool.query(query, [orderId]);
        
        const linkedInvoices = result.rows.map(row => ({
            id: row.id,
            invoice_number: row.invoice_number,
            supplier_name: row.supplier_name,
            total_amount: parseFloat(row.total_amount),
            invoice_date: row.invoice_date,
            linked_at: row.linked_at
        }));

        res.json({
            success: true,
            data: linkedInvoices
        });
        
    } catch (error) {
        console.error('خطأ في جلب الفواتير المرتبطة:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفواتير المرتبطة',
            data: []
        });
    }
});

// 🔗 API ربط فاتورة بأمر شراء
router.post('/purchase-orders/:orderId/link-invoice/:invoiceId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { orderId, invoiceId } = req.params;
        
        // التحقق من وجود أمر الشراء والفاتورة
        const orderCheck = await client.query('SELECT id FROM purchase_orders WHERE id = $1', [orderId]);
        const invoiceCheck = await client.query('SELECT id FROM invoices WHERE id = $1', [invoiceId]);
        
        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        if (invoiceCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'الفاتورة غير موجودة'
            });
        }
        
        // التحقق من عدم وجود ربط مسبق
        const linkCheck = await client.query(
            'SELECT id FROM invoice_purchase_order_links WHERE invoice_id = $1 AND purchase_order_id = $2',
            [invoiceId, orderId]
        );
        
        if (linkCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'الفاتورة مرتبطة بالفعل بهذا الأمر'
            });
        }
        
        // إنشاء الربط
        await client.query(
            'INSERT INTO invoice_purchase_order_links (invoice_id, purchase_order_id) VALUES ($1, $2)',
            [invoiceId, orderId]
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم ربط الفاتورة بأمر الشراء بنجاح'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في ربط الفاتورة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء ربط الفاتورة'
        });
    } finally {
        client.release();
    }
});

// 🔗 API إلغاء ربط فاتورة من أمر شراء
router.delete('/purchase-orders/:orderId/unlink-invoice/:invoiceId', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { orderId, invoiceId } = req.params;
        
        // حذف الربط
        const result = await client.query(
            'DELETE FROM invoice_purchase_order_links WHERE invoice_id = $1 AND purchase_order_id = $2',
            [invoiceId, orderId]
        );
        
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'الربط غير موجود'
            });
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم إلغاء ربط الفاتورة بنجاح'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إلغاء ربط الفاتورة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء إلغاء ربط الفاتورة'
        });
    } finally {
        client.release();
    }
});

// 📊 API حساب الموازنة لأمر شراء محدد
router.get('/purchase-orders/:id/budget-analysis', async (req, res) => {
    try {
        const orderId = req.params.id;
        
        // جلب معلومات أمر الشراء
        const orderResult = await pool.query(
            'SELECT amount FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        
        if (orderResult.rows.length === 0) {
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        const orderAmount = parseFloat(orderResult.rows[0].amount);
        
        // جلب إجمالي الفواتير المرتبطة
        const invoicesResult = await pool.query(`
            SELECT 
                SUM(i.total_amount) as total_invoices_amount,
                COUNT(i.id) as invoices_count
            FROM invoices i
            INNER JOIN invoice_purchase_order_links ipl ON i.id = ipl.invoice_id
            WHERE ipl.purchase_order_id = $1
        `, [orderId]);
        
        const totalInvoicesAmount = parseFloat(invoicesResult.rows[0].total_invoices_amount) || 0;
        const invoicesCount = parseInt(invoicesResult.rows[0].invoices_count);
        
        // حساب الموازنة
        const balance = orderAmount - totalInvoicesAmount;
        const balancePercentage = orderAmount > 0 ? (balance / orderAmount) * 100 : 0;
        
        let balanceStatus = 'balanced';
        if (balance > 0) {
            balanceStatus = 'under_budget';
        } else if (balance < 0) {
            balanceStatus = 'over_budget';
        }
        
        res.json({
            success: true,
            data: {
                order_amount: orderAmount,
                total_invoices_amount: totalInvoicesAmount,
                balance: balance,
                balance_percentage: Math.round(balancePercentage * 100) / 100,
                balance_status: balanceStatus,
                invoices_count: invoicesCount
            }
        });
        
    } catch (error) {
        console.error('خطأ في حساب الموازنة:', error);
        res.json({
            success: false,
            message: 'خطأ في حساب الموازنة'
        });
    }
});

// ============== APIs المدفوعات ==============

// 💰 API إضافة دفعة جديدة
router.post('/payments', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            supplier_name,
            payment_date,
            amount,
            notes
        } = req.body;

        // التحقق من البيانات المطلوبة
        if (!supplier_name || !payment_date || !amount) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب ملؤها'
            });
        }

        // التحقق من وجود المورد
        const supplierCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplier_name]
        );
        
        if (supplierCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'المورد غير موجود'
            });
        }

        // إدراج الدفعة
        const insertResult = await client.query(`
            INSERT INTO payments (
                supplier_name,
                payment_date,
                amount,
                notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [
            supplier_name,
            payment_date,
            parseFloat(amount),
            notes || null
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ الدفعة بنجاح',
            data: {
                id: insertResult.rows[0].id,
                supplier_name: supplier_name,
                amount: parseFloat(amount)
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إضافة الدفعة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حفظ الدفعة: ' + error.message
        });
    } finally {
        client.release();
    }
});

// 💰 API جلب مدفوعات مورد
router.get('/payments/:supplier_name', async (req, res) => {
    try {
        const supplierName = req.params.supplier_name;
        
        const result = await pool.query(`
            SELECT 
                id,
                payment_date,
                amount,
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
            notes: row.notes,
            created_at: row.created_at
        }));

        res.json({
            success: true,
            data: payments
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

// 💰 API حذف دفعة
router.delete('/payments/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        
        const result = await pool.query('DELETE FROM payments WHERE id = $1 RETURNING *', [paymentId]);
        
        if (result.rowCount === 0) {
            return res.json({
                success: false,
                message: 'الدفعة غير موجودة'
            });
        }
        
        res.json({
            success: true,
            message: 'تم حذف الدفعة بنجاح'
        });
        
    } catch (error) {
        console.error('خطأ في حذف الدفعة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حذف الدفعة'
        });
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
