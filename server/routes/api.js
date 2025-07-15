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
            system: 'ERP الرائد - الإصدار 3.0'
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

        // إجمالي المدفوعات
        const totalPaidResult = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
        const totalPaid = parseFloat(totalPaidResult.rows[0].total);

        // إحصائيات إضافية
        const monthlyStatsResult = await pool.query(`
            SELECT 
                COUNT(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as this_month_invoices,
                COUNT(CASE WHEN DATE_TRUNC('week', created_at) = DATE_TRUNC('week', CURRENT_DATE) THEN 1 END) as this_week_invoices
            FROM invoices
        `);

        res.json({
            success: true,
            data: {
                suppliersCount,
                invoicesCount,
                ordersCount,
                totalAmount: Math.round(totalAmount * 100) / 100,
                totalPaid: Math.round(totalPaid * 100) / 100,
                balance: Math.round((totalAmount - totalPaid) * 100) / 100,
                thisMonthInvoices: parseInt(monthlyStatsResult.rows[0].this_month_invoices || 0),
                thisWeekInvoices: parseInt(monthlyStatsResult.rows[0].this_week_invoices || 0)
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
                totalAmount: 0,
                totalPaid: 0,
                balance: 0,
                thisMonthInvoices: 0,
                thisWeekInvoices: 0
            }
        });
    }
});

// ============== APIs الموردين ==============

// 🏢 API جلب الموردين مع إحصائياتهم المفصلة
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id,
                s.name,
                s.contact_info,
                s.address,
                COUNT(DISTINCT i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_amount,
                COALESCE(SUM(p.amount), 0) as total_paid,
                (COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(p.amount), 0)) as balance,
                COUNT(DISTINCT po.id) as purchase_orders_count,
                COALESCE(SUM(po.amount), 0) as purchase_orders_total,
                MAX(i.created_at) as last_invoice_date,
                s.created_at
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            LEFT JOIN payments p ON s.name = p.supplier_name
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name
            GROUP BY s.id, s.name, s.contact_info, s.address, s.created_at
            ORDER BY s.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        const suppliers = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            contact_info: row.contact_info,
            address: row.address,
            invoice_count: parseInt(row.invoice_count),
            total_amount: parseFloat(row.total_amount),
            total_paid: parseFloat(row.total_paid),
            balance: parseFloat(row.balance),
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

// 🔄 API تحديث اسم مورد
router.put('/suppliers/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const supplierId = req.params.id;
        const { name, contact_info, address } = req.body;
        
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
        
        // تحديث معلومات المورد
        await client.query(
            'UPDATE suppliers SET name = $1, contact_info = $2, address = $3 WHERE id = $4',
            [name.trim(), contact_info || null, address || null, supplierId]
        );
        
        // تحديث اسم المورد في جميع الجداول المرتبطة
        await client.query(
            'UPDATE invoices SET supplier_name = $1 WHERE supplier_name = $2',
            [name.trim(), oldName]
        );
        
        await client.query(
            'UPDATE purchase_orders SET supplier_name = $1 WHERE supplier_name = $2',
            [name.trim(), oldName]
        );

        await client.query(
            'UPDATE payments SET supplier_name = $1 WHERE supplier_name = $2',
            [name.trim(), oldName]
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'تم تحديث معلومات المورد بنجاح',
            data: {
                id: supplierId,
                old_name: oldName,
                new_name: name.trim(),
                contact_info: contact_info,
                address: address
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في تحديث المورد:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء تحديث المورد'
        });
    } finally {
        client.release();
    }
});

// ============== APIs الفواتير ==============

// 📋 API جلب جميع الفواتير مع إمكانية الفلترة المتقدمة
router.get('/invoices', async (req, res) => {
    try {
        const { 
            supplier_name, 
            search, 
            date_from, 
            date_to,
            invoice_type,
            category,
            min_amount,
            max_amount,
            limit = 100,
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'DESC'
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

        // فلترة حسب نوع الفاتورة
        if (invoice_type) {
            query += ` AND invoice_type ILIKE $${paramIndex}`;
            params.push(`%${invoice_type}%`);
            paramIndex++;
        }

        // فلترة حسب الفئة
        if (category) {
            query += ` AND category ILIKE $${paramIndex}`;
            params.push(`%${category}%`);
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

        // فلترة حسب المبلغ
        if (min_amount) {
            query += ` AND total_amount >= $${paramIndex}`;
            params.push(parseFloat(min_amount));
            paramIndex++;
        }

        if (max_amount) {
            query += ` AND total_amount <= $${paramIndex}`;
            params.push(parseFloat(max_amount));
            paramIndex++;
        }
        
        // الترتيب
        const allowedSortColumns = ['invoice_number', 'supplier_name', 'invoice_date', 'total_amount', 'created_at'];
        const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortColumn} ${sortDirection} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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
            total: invoices.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
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
                created_at: invoice.created_at,
                updated_at: invoice.updated_at
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
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'جميع الحقول المطلوبة يجب ملؤها'
            });
        }

        // التحقق من صحة التاريخ
        const invoiceDateObj = new Date(invoiceDate);
        if (isNaN(invoiceDateObj.getTime())) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'تاريخ الفاتورة غير صحيح'
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
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
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
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
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
                file_path = $9,
                updated_at = CURRENT_TIMESTAMP
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
            message: 'حدث خطأ أثناء تحديث الفاتورة'
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
            offset = 0,
            sort_by = 'created_at',
            sort_order = 'DESC'
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
        const allowedSortColumns = ['order_number', 'supplier_name', 'order_date', 'amount', 'created_at'];
        const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortColumn} ${sortDirection} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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

        // التحقق من عدم تكرار رقم الأمر
        if (finalOrderNumber) {
            const duplicateCheck = await client.query(
                'SELECT id FROM purchase_orders WHERE order_number = $1',
                [finalOrderNumber]
            );
            
            if (duplicateCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
                return res.json({
                    success: false,
                    message: 'رقم أمر الشراء موجود مسبقاً'
                });
            }
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
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'أمر الشراء غير موجود'
            });
        }
        
        const existingOrder = orderCheck.rows[0];

        // التحقق من عدم تكرار رقم الأمر (إذا تم تغييره)
        if (editOrderNumber && editOrderNumber !== existingOrder.order_number) {
            const duplicateCheck = await client.query(
                'SELECT id FROM purchase_orders WHERE order_number = $1 AND id != $2',
                [editOrderNumber, orderId]
            );
            
            if (duplicateCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                if (req.file) {
                    fs.unlinkSync(req.file.path);
                }
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
                file_path = $9,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
        `;
        
        await client.query(updateQuery, [
            editOrderNumber || existingOrder.order_number,
            editSupplierName || existingOrder.supplier_name,
            editOrderDescription || existingOrder.description,
            parseFloat(editOrderAmount) || existingOrder.amount,
            editOrderStatus || existingOrder.status,
            editOrderDate || existingOrder.order_date,
            editDeliveryDate || existingOrder.delivery_date,
            editOrderNotes !== undefined ? editOrderNotes : existingOrder.notes,
            filePath,
            orderId
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم تحديث أمر الشراء بنجاح' + (req.file ? ' مع تحديث الملف' : ''),
            data: {
                id: orderId,
                order_number: editOrderNumber || existingOrder.order_number,
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
            message: 'حدث خطأ أثناء تحديث أمر الشراء'
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
            payment_method,
            reference_number,
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

        // التحقق من صحة المبلغ
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'مبلغ الدفعة يجب أن يكون أكبر من صفر'
            });
        }

        // التحقق من وجود المورد
        const supplierCheck = await client.query(
            'SELECT id FROM suppliers WHERE name = $1',
            [supplier_name.trim()]
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
                payment_method,
                reference_number,
                notes
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [
            supplier_name.trim(),
            payment_date,
            paymentAmount,
            payment_method || 'cash',
            reference_number || null,
            notes ? notes.trim() : null
        ]);

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'تم حفظ الدفعة بنجاح',
            data: {
                id: insertResult.rows[0].id,
                supplier_name: supplier_name.trim(),
                amount: paymentAmount
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('خطأ في إضافة الدفعة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حفظ الدفعة'
        });
    } finally {
        client.release();
    }
});

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
            message: 'تم حذف الدفعة بنجاح',
            data: {
                deleted_payment: {
                    id: result.rows[0].id,
                    supplier_name: result.rows[0].supplier_name,
                    amount: parseFloat(result.rows[0].amount)
                }
            }
        });
        
    } catch (error) {
        console.error('خطأ في حذف الدفعة:', error);
        res.json({
            success: false,
            message: 'حدث خطأ أثناء حذف الدفعة'
        });
    }
});

// ============== APIs التقارير ==============

// 📊 API تقرير شامل للموردين
router.get('/reports/suppliers', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        
        let dateFilter = '';
        const params = [];
        
        if (date_from && date_to) {
            dateFilter = 'AND i.invoice_date BETWEEN $1 AND $2';
            params.push(date_from, date_to);
        }
        
        const query = `
            SELECT 
                s.name as supplier_name,
                COUNT(DISTINCT i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_invoices,
                COALESCE(SUM(p.amount), 0) as total_payments,
                (COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(p.amount), 0)) as balance,
                COUNT(DISTINCT po.id) as purchase_orders_count,
                COALESCE(SUM(po.amount), 0) as purchase_orders_total
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name ${dateFilter}
            LEFT JOIN payments p ON s.name = p.supplier_name ${date_from && date_to ? 'AND p.payment_date BETWEEN $1 AND $2' : ''}
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name ${date_from && date_to ? 'AND po.order_date BETWEEN $1 AND $2' : ''}
            GROUP BY s.name
            ORDER BY total_invoices DESC
        `;
        
        const result = await pool.query(query, params);
        
        const report = result.rows.map(row => ({
            supplier_name: row.supplier_name,
            invoice_count: parseInt(row.invoice_count),
            total_invoices: parseFloat(row.total_invoices),
            total_payments: parseFloat(row.total_payments),
            balance: parseFloat(row.balance),
            purchase_orders_count: parseInt(row.purchase_orders_count),
            purchase_orders_total: parseFloat(row.purchase_orders_total)
        }));

        res.json({
            success: true,
            data: report,
            total: report.length,
            period: {
                from: date_from,
                to: date_to
            }
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء التقرير:', error);
        res.json({
            success: false,
            message: 'خطأ في إنشاء التقرير',
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
        
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.json({
                success: false,
                message: 'عدد الملفات كبير جداً'
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
