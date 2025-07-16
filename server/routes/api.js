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
            try {
                fs.mkdirSync(uploadDir, { recursive: true });
                console.log('✅ تم إنشاء مجلد uploads');
            } catch (error) {
                console.error('❌ خطأ في إنشاء مجلد uploads:', error);
                return cb(error);
            }
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

// دالة مساعدة للتحقق من اتصال قاعدة البيانات
async function checkDatabaseConnection() {
    try {
        const result = await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error('❌ خطأ في اتصال قاعدة البيانات:', error.message);
        return false;
    }
}

// دالة للتحقق من وجود عمود في جدول
async function checkColumnExists(tableName, columnName) {
    try {
        const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
        `, [tableName, columnName]);
        
        return result.rows.length > 0;
    } catch (error) {
        console.warn(`⚠️ خطأ في فحص العمود ${columnName} في ${tableName}:`, error.message);
        return false;
    }
}

// ============== APIs الأساسية ==============

// 🧪 API اختبار الاتصال
router.get('/test', async (req, res) => {
    try {
        const dbConnected = await checkDatabaseConnection();
        
        if (dbConnected) {
            const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
            res.json({
                success: true,
                message: 'الخادم يعمل بنجاح!',
                database: 'متصل ✅',
                time: result.rows[0].current_time,
                version: result.rows[0].db_version.split(' ')[0] + ' ' + result.rows[0].db_version.split(' ')[1],
                system: 'ERP الرائد - الإصدار 3.2'
            });
        } else {
            res.json({
                success: true,
                message: 'الخادم يعمل بنجاح!',
                database: 'غير متصل ❌',
                warning: 'قاعدة البيانات غير متاحة',
                system: 'ERP الرائد - الإصدار 3.2'
            });
        }
    } catch (error) {
        console.error('خطأ في اختبار قاعدة البيانات:', error);
        res.json({
            success: false,
            message: 'خطأ في اختبار النظام',
            database: 'خطأ في الاتصال ❌',
            error: process.env.NODE_ENV === 'production' ? 'خطأ في قاعدة البيانات' : error.message
        });
    }
});

// 📊 API إحصائيات النظام الشاملة - للصفحة الرئيسية
router.get('/stats', async (req, res) => {
    try {
        console.log('📊 طلب إحصائيات النظام...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: {
                    suppliersCount: 0,
                    invoicesCount: 0,
                    ordersCount: 0,
                    totalAmount: 0
                }
            });
        }

        // استعلام شامل للحصول على جميع الإحصائيات دفعة واحدة
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM suppliers) as suppliers_count,
                (SELECT COUNT(*) FROM invoices) as invoices_count,
                (SELECT COUNT(*) FROM purchase_orders) as orders_count,
                (SELECT COALESCE(SUM(total_amount), 0) FROM invoices) as total_amount
        `;
        
        const result = await pool.query(statsQuery);
        const stats = result.rows[0];
        
        const responseData = {
            suppliersCount: parseInt(stats.suppliers_count) || 0,
            invoicesCount: parseInt(stats.invoices_count) || 0,
            ordersCount: parseInt(stats.orders_count) || 0,
            totalAmount: parseFloat(stats.total_amount) || 0
        };

        console.log('📊 الإحصائيات:', responseData);

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الإحصائيات: ' + error.message,
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

// 🏢 API جلب الموردين مع إحصائياتهم المفصلة - للصفحة الرئيسية وصفحة العرض
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        console.log('🏢 طلب الموردين مع الإحصائيات...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: [],
                total: 0
            });
        }

        const query = `
            SELECT 
                s.id,
                s.name,
                COALESCE(i.invoice_count, 0) as invoice_count,
                COALESCE(i.total_amount, 0) as total_amount,
                COALESCE(po.purchase_orders_count, 0) as purchase_orders_count,
                COALESCE(po.purchase_orders_total, 0) as purchase_orders_total,
                i.last_invoice_date,
                s.created_at
            FROM suppliers s
            LEFT JOIN (
                SELECT 
                    supplier_name,
                    COUNT(*) as invoice_count,
                    SUM(total_amount) as total_amount,
                    MAX(created_at) as last_invoice_date
                FROM invoices
                GROUP BY supplier_name
            ) i ON s.name = i.supplier_name
            LEFT JOIN (
                SELECT 
                    supplier_name,
                    COUNT(*) as purchase_orders_count,
                    SUM(amount) as purchase_orders_total
                FROM purchase_orders
                GROUP BY supplier_name
            ) po ON s.name = po.supplier_name
            ORDER BY s.created_at DESC
        `;
        
        const result = await pool.query(query);
        
        const suppliers = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            invoice_count: parseInt(row.invoice_count) || 0,
            total_amount: parseFloat(row.total_amount) || 0,
            purchase_orders_count: parseInt(row.purchase_orders_count) || 0,
            purchase_orders_total: parseFloat(row.purchase_orders_total) || 0,
            last_invoice_date: row.last_invoice_date,
            created_at: row.created_at
        }));

        console.log(`👥 تم جلب ${suppliers.length} مورد`);

        res.json({
            success: true,
            data: suppliers,
            total: suppliers.length
        });
    } catch (error) {
        console.error('خطأ في جلب الموردين:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الموردين: ' + error.message,
            data: [],
            total: 0
        });
    }
});

// 👥 API جلب قائمة الموردين للإكمال التلقائي
router.get('/suppliers', async (req, res) => {
    try {
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: []
            });
        }

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
            message: 'خطأ في جلب قائمة الموردين: ' + error.message,
            data: []
        });
    }
});

// ============== APIs الفواتير ==============

// 📋 API جلب جميع الفواتير مع إمكانية الفلترة - لصفحة العرض (مع حماية من الأعمدة المفقودة)
router.get('/invoices', async (req, res) => {
    try {
        console.log('📋 طلب الفواتير...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: [],
                total: 0
            });
        }

        // التحقق من وجود عمود status
        const hasStatusColumn = await checkColumnExists('invoices', 'status');
        const hasUpdatedAtColumn = await checkColumnExists('invoices', 'updated_at');

        const { 
            supplier_name, 
            search, 
            date_from, 
            date_to,
            invoice_type,
            category,
            limit = 100,
            offset = 0
        } = req.query;
        
        console.log('🔍 فلاتر البحث:', { supplier_name, search, date_from, date_to, invoice_type, category });
        
        // بناء استعلام ديناميكي حسب الأعمدة المتاحة
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
                ${hasStatusColumn ? 'status,' : "'pending' as status,"}
                created_at
                ${hasUpdatedAtColumn ? ', updated_at' : ', created_at as updated_at'}
            FROM invoices
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        // فلترة حسب المورد - مهم لصفحة العرض
        if (supplier_name) {
            query += ` AND supplier_name = $${paramIndex}`;
            params.push(supplier_name);
            paramIndex++;
        }
        
        // البحث في رقم الفاتورة أو نوع الفاتورة أو الفئة أو الملاحظات
        if (search) {
            query += ` AND (invoice_number ILIKE $${paramIndex} OR invoice_type ILIKE $${paramIndex} OR category ILIKE $${paramIndex} OR notes ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        // فلترة حسب نوع الفاتورة
        if (invoice_type) {
            query += ` AND invoice_type = $${paramIndex}`;
            params.push(invoice_type);
            paramIndex++;
        }
        
        // فلترة حسب الفئة
        if (category) {
            query += ` AND category = $${paramIndex}`;
            params.push(category);
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
        
        // الترتيب والحد
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
            status: row.status || 'pending',
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        console.log(`📋 تم جلب ${invoices.length} فاتورة`);

        res.json({
            success: true,
            data: invoices,
            total: invoices.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفواتير: ' + error.message,
            data: [],
            total: 0
        });
    }
});

// 📋 API جلب أحدث الفواتير - للصفحة الرئيسية
router.get('/recent-invoices', async (req, res) => {
    try {
        console.log('📋 طلب أحدث الفواتير...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: []
            });
        }

        // التحقق من وجود عمود status
        const hasStatusColumn = await checkColumnExists('invoices', 'status');

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
                ${hasStatusColumn ? ', status' : ", 'pending' as status"}
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
            category: row.category,
            status: row.status || 'pending'
        }));

        console.log(`📋 تم جلب ${invoices.length} فاتورة حديثة`);

        res.json({
            success: true,
            data: invoices
        });
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفواتير: ' + error.message,
            data: []
        });
    }
});

// 🔍 API جلب فاتورة محددة بـ ID
router.get('/invoices/:id', async (req, res) => {
    try {
        const invoiceId = parseInt(req.params.id);
        
        if (isNaN(invoiceId)) {
            return res.json({
                success: false,
                message: 'رقم الفاتورة غير صحيح'
            });
        }
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: null
            });
        }

        // التحقق من وجود عمود status
        const hasStatusColumn = await checkColumnExists('invoices', 'status');
        const hasUpdatedAtColumn = await checkColumnExists('invoices', 'updated_at');

        const query = `
            SELECT 
                id, invoice_number, supplier_name, invoice_type, category,
                invoice_date, amount_before_tax, tax_amount, total_amount,
                notes, file_path, created_at
                ${hasStatusColumn ? ', status' : ", 'pending' as status"}
                ${hasUpdatedAtColumn ? ', updated_at' : ', created_at as updated_at'}
            FROM invoices
            WHERE id = $1
        `;
        
        const result = await pool.query(query, [invoiceId]);
        
        if (result.rows.length === 0) {
            return res.json({
                success: false,
                message: 'الفاتورة غير موجودة',
                data: null
            });
        }
        
        const invoice = {
            id: result.rows[0].id,
            invoice_number: result.rows[0].invoice_number,
            supplier_name: result.rows[0].supplier_name,
            invoice_type: result.rows[0].invoice_type,
            category: result.rows[0].category,
            invoice_date: result.rows[0].invoice_date,
            amount_before_tax: parseFloat(result.rows[0].amount_before_tax),
            tax_amount: parseFloat(result.rows[0].tax_amount || 0),
            total_amount: parseFloat(result.rows[0].total_amount),
            notes: result.rows[0].notes,
            file_path: result.rows[0].file_path,
            status: result.rows[0].status || 'pending',
            created_at: result.rows[0].created_at,
            updated_at: result.rows[0].updated_at
        };

        res.json({
            success: true,
            data: invoice
        });
        
    } catch (error) {
        console.error('خطأ في جلب الفاتورة:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب الفاتورة: ' + error.message,
            data: null
        });
    }
});

// ➕ API إضافة فاتورة جديدة مع رفع الملفات - لصفحة الإضافة
router.post('/invoices', upload.single('invoiceFile'), async (req, res) => {
    let client;
    
    try {
        console.log('➕ طلب إضافة فاتورة جديدة...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة'
            });
        }

        // التحقق من وجود الأعمدة
        const hasStatusColumn = await checkColumnExists('invoices', 'status');
        const hasUpdatedAtColumn = await checkColumnExists('invoices', 'updated_at');

        client = await pool.connect();
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

        console.log('البيانات المستلمة:', {
            invoiceNumber,
            supplierName,
            invoiceType,
            category,
            invoiceDate,
            amountBeforeTax,
            taxAmount,
            fileUploaded: !!req.file
        });

        // التحقق من البيانات المطلوبة
        if (!supplierName || !invoiceDate || !amountBeforeTax) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'الحقول المطلوبة: اسم المورد، تاريخ الفاتورة، والمبلغ قبل الضريبة'
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
                message: 'مبلغ الفاتورة يجب أن يكون رقماً صحيحاً وأكبر من الصفر'
            });
        }

        // إنشاء رقم فاتورة تلقائي إذا لم يتم تقديمه
        let finalInvoiceNumber = invoiceNumber;
        if (!finalInvoiceNumber || !finalInvoiceNumber.trim()) {
            finalInvoiceNumber = 'INV-' + Date.now();
        }

        // التحقق من عدم تكرار رقم الفاتورة
        const duplicateCheck = await client.query(
            'SELECT id FROM invoices WHERE invoice_number = $1',
            [finalInvoiceNumber.trim()]
        );
        
        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'رقم الفاتورة موجود مسبقاً: ' + finalInvoiceNumber.trim()
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
            console.log('✅ تم إضافة مورد جديد:', supplierName);
        }

        // حساب المبلغ الإجمالي
        const totalAmount = amountBeforeTaxNum + taxAmountNum;

        // مسار الملف المرفوع
        let filePath = null;
        if (req.file) {
            filePath = req.file.filename; // حفظ اسم الملف فقط
            console.log('📎 تم رفع الملف:', filePath);
        }

        // بناء استعلام الإدراج ديناميكياً
        let insertQuery = `
            INSERT INTO invoices (
                invoice_number, supplier_name, invoice_type, category,
                invoice_date, amount_before_tax, tax_amount, total_amount,
                notes, file_path
        `;
        
        let values = `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10`;
        let params = [
            finalInvoiceNumber.trim(),
            supplierName.trim(),
            (invoiceType && invoiceType.trim()) || 'عام',
            (category && category.trim()) || 'عام',
            invoiceDate,
            amountBeforeTaxNum,
            taxAmountNum,
            totalAmount,
            notes ? notes.trim() : null,
            filePath
        ];
        
        let paramCount = 10;
        
        // إضافة عمود status إذا كان موجوداً
        if (hasStatusColumn) {
            insertQuery += ', status';
            values += ', $' + (++paramCount);
            params.push('pending');
        }
        
        insertQuery += ') ' + values + ') RETURNING id, invoice_number, total_amount';
        
        const insertResult = await client.query(insertQuery, params);

        await client.query('COMMIT');

        const newInvoice = insertResult.rows[0];

        console.log('✅ تم حفظ الفاتورة بنجاح:', {
            id: newInvoice.id,
            invoice_number: newInvoice.invoice_number,
            total_amount: parseFloat(newInvoice.total_amount),
            file_uploaded: !!req.file
        });

        res.json({
            success: true,
            message: 'تم حفظ الفاتورة بنجاح' + (req.file ? ' مع الملف المرفق' : ''),
            data: {
                id: newInvoice.id,
                invoice_number: newInvoice.invoice_number,
                total_amount: parseFloat(newInvoice.total_amount),
                file_uploaded: !!req.file
            }
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
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
        if (client) client.release();
    }
});

// ============== APIs أوامر الشراء ==============

// 🛒 API جلب جميع أوامر الشراء - لصفحة أوامر الشراء (مع حماية من الأعمدة المفقودة)
router.get('/purchase-orders', async (req, res) => {
    try {
        console.log('🛒 طلب أوامر الشراء...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: []
            });
        }

        // التحقق من وجود الأعمدة
        const hasOrderNumberColumn = await checkColumnExists('purchase_orders', 'order_number');
        const hasStatusColumn = await checkColumnExists('purchase_orders', 'status');
        const hasUpdatedAtColumn = await checkColumnExists('purchase_orders', 'updated_at');

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
                ${hasOrderNumberColumn ? 'order_number,' : 'LPAD(id::text, 4, \'0\') as order_number,'}
                supplier_name,
                description,
                amount,
                ${hasStatusColumn ? 'status,' : "'pending' as status,"}
                order_date,
                delivery_date,
                notes,
                file_path,
                created_at
                ${hasUpdatedAtColumn ? ', updated_at' : ', created_at as updated_at'}
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
        if (status && hasStatusColumn) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // البحث العام
        if (search) {
            if (hasOrderNumberColumn) {
                query += ` AND (order_number ILIKE $${paramIndex} OR supplier_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            } else {
                query += ` AND (supplier_name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            }
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
        
        // الترتيب والحد
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(query, params);
        
        const orders = result.rows.map(row => ({
            id: row.id,
            order_number: row.order_number || String(row.id).padStart(4, '0'),
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

        console.log(`🛒 تم جلب ${orders.length} أمر شراء`);

        res.json({
            success: true,
            data: orders,
            total: orders.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب أوامر الشراء:', error);
        res.json({
            success: false,
            message: 'خطأ في جلب أوامر الشراء: ' + error.message,
            data: []
        });
    }
});

// 🛒 API إضافة أمر شراء جديد - لصفحة أوامر الشراء
router.post('/purchase-orders', upload.single('orderFile'), async (req, res) => {
    let client;
    
    try {
        console.log('🛒 طلب إضافة أمر شراء جديد...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة'
            });
        }

        // التحقق من وجود الأعمدة
        const hasOrderNumberColumn = await checkColumnExists('purchase_orders', 'order_number');
        const hasStatusColumn = await checkColumnExists('purchase_orders', 'status');

        client = await pool.connect();
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

        console.log('بيانات أمر الشراء المستلمة:', {
            supplierName,
            orderDescription: orderDescription?.substring(0, 50) + '...',
            orderAmount,
            orderDate,
            fileUploaded: !!req.file
        });

        // التحقق من البيانات المطلوبة
        if (!supplierName || !orderDescription || !orderAmount || !orderDate) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'الحقول المطلوبة: اسم المورد، البيان، المبلغ، والتاريخ'
            });
        }

        // التحقق من صحة المبلغ
        const amount = parseFloat(orderAmount);
        if (isNaN(amount) || amount < 0) {
            await client.query('ROLLBACK');
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.json({
                success: false,
                message: 'مبلغ أمر الشراء يجب أن يكون رقماً صحيحاً وأكبر من الصفر'
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
            console.log('✅ تم إضافة مورد جديد:', supplierName);
        }

        // مسار الملف المرفوع
        let filePath = null;
        if (req.file) {
            filePath = req.file.filename;
            console.log('📎 تم رفع الملف:', filePath);
        }

        // بناء استعلام الإدراج ديناميكياً
        let insertQuery = `
            INSERT INTO purchase_orders (
                supplier_name, description, amount, order_date, delivery_date, notes, file_path
        `;
        
        let values = `VALUES ($1, $2, $3, $4, $5, $6, $7`;
        let params = [
            supplierName.trim(),
            orderDescription.trim(),
            amount,
            orderDate,
            deliveryDate || null,
            orderNotes ? orderNotes.trim() : null,
            filePath
        ];
        
        let paramCount = 7;
        
        // إضافة عمود order_number إذا كان موجوداً
        if (hasOrderNumberColumn) {
            insertQuery += ', order_number';
            values += ', $' + (++paramCount);
            params.push(finalOrderNumber);
        }
        
        // إضافة عمود status إذا كان موجوداً
        if (hasStatusColumn) {
            insertQuery += ', status';
            values += ', $' + (++paramCount);
            params.push(orderStatus || 'pending');
        }
        
        insertQuery += ') ' + values + ') RETURNING id, amount';
        
        const insertResult = await client.query(insertQuery, params);

        await client.query('COMMIT');

        const newOrder = insertResult.rows[0];

        console.log('✅ تم حفظ أمر الشراء بنجاح:', {
            id: newOrder.id,
            order_number: finalOrderNumber,
            amount: parseFloat(newOrder.amount),
            file_uploaded: !!req.file
        });

        res.json({
            success: true,
            message: 'تم حفظ أمر الشراء بنجاح' + (req.file ? ' مع الملف المرفق' : ''),
            data: {
                id: newOrder.id,
                order_number: finalOrderNumber,
                amount: parseFloat(newOrder.amount),
                file_uploaded: !!req.file
            }
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
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
            message: 'حدث خطأ أثناء حفظ أمر الشراء: ' + (process.env.NODE_ENV === 'production' ? 'خطأ في النظام' : error.message)
        });
    } finally {
        if (client) client.release();
    }
});

// ============== APIs المدفوعات ==============

// 💰 API جلب مدفوعات مورد
router.get('/payments/:supplier_name', async (req, res) => {
    try {
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة',
                data: []
            });
        }

        const supplierName = decodeURIComponent(req.params.supplier_name);
        
        const result = await pool.query(`
            SELECT 
                id, payment_date, amount, payment_method,
                reference_number, notes, created_at
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
            message: 'خطأ في جلب المدفوعات: ' + error.message,
            data: []
        });
    }
});

// ============== إصلاح قاعدة البيانات ==============

// 🔧 API إصلاح سريع لقاعدة البيانات - حل جميع مشاكل الأعمدة المفقودة
router.get('/fix-database', async (req, res) => {
    let client;
    
    try {
        console.log('🔧 بدء إصلاح قاعدة البيانات...');
        
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            return res.json({
                success: false,
                message: 'قاعدة البيانات غير متاحة'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');
        
        const fixes = [];
        
        // 1. إضافة عمود status إلى جدول invoices
        try {
            await client.query(`
                ALTER TABLE invoices 
                ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'
            `);
            fixes.push('✅ تم إضافة عمود status إلى جدول invoices');
            
            // إضافة قيد check للعمود
            await client.query(`
                ALTER TABLE invoices 
                DROP CONSTRAINT IF EXISTS invoices_status_check
            `);
            
            await client.query(`
                ALTER TABLE invoices 
                ADD CONSTRAINT invoices_status_check 
                CHECK (status IN ('pending', 'paid', 'cancelled', 'overdue'))
            `);
            fixes.push('✅ تم إضافة قيود التحقق لعمود status');
            
        } catch (error) {
            fixes.push('⚠️ عمود status: ' + error.message);
        }
        
        // 2. إضافة عمود order_number إلى جدول purchase_orders
        try {
            await client.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS order_number VARCHAR(100)
            `);
            fixes.push('✅ تم إضافة عمود order_number إلى جدول purchase_orders');
            
        } catch (error) {
            fixes.push('⚠️ عمود order_number: ' + error.message);
        }
        
        // 3. إضافة عمود updated_at إلى جميع الجداول
        const tables = ['suppliers', 'invoices', 'purchase_orders'];
        
        for (const table of tables) {
            try {
                await client.query(`
                    ALTER TABLE ${table} 
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                `);
                fixes.push(`✅ تم إضافة عمود updated_at إلى جدول ${table}`);
                
            } catch (error) {
                fixes.push(`⚠️ عمود updated_at في ${table}: ${error.message}`);
            }
        }
        
        // 4. تحديث البيانات الموجودة
        try {
            // تحديث حالة الفواتير الفارغة
            const invoiceUpdate = await client.query(`
                UPDATE invoices 
                SET status = 'pending' 
                WHERE status IS NULL OR status = ''
            `);
            
            if (invoiceUpdate.rowCount > 0) {
                fixes.push(`✅ تم تحديث حالة ${invoiceUpdate.rowCount} فاتورة`);
            }
            
            // إنشاء أرقام أوامر شراء مفقودة
            const orderUpdate = await client.query(`
                UPDATE purchase_orders 
                SET order_number = LPAD(id::text, 4, '0')
                WHERE order_number IS NULL OR order_number = ''
            `);
            
            if (orderUpdate.rowCount > 0) {
                fixes.push(`✅ تم إنشاء أرقام لـ ${orderUpdate.rowCount} أمر شراء`);
            }
            
            // تحديث updated_at للسجلات الموجودة
            for (const table of tables) {
                await client.query(`
                    UPDATE ${table} 
                    SET updated_at = created_at 
                    WHERE updated_at IS NULL
                `);
            }
            fixes.push('✅ تم تحديث أوقات التعديل للسجلات الموجودة');
            
        } catch (error) {
            fixes.push('⚠️ خطأ في تحديث البيانات: ' + error.message);
        }
        
        // 5. إنشاء الفهارس المفقودة
        try {
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
                'CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(order_number)',
                'CREATE INDEX IF NOT EXISTS idx_invoices_supplier_status ON invoices(supplier_name, status)'
            ];
            
            for (const indexQuery of indexes) {
                await client.query(indexQuery);
            }
            fixes.push('✅ تم إنشاء الفهارس المطلوبة');
            
        } catch (error) {
            fixes.push('⚠️ خطأ في الفهارس: ' + error.message);
        }
        
        // 6. إنشاء triggers للتحديث التلقائي
        try {
            await client.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            `);
            
            const triggers = [
                'DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers',
                'CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                'DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices',
                'CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                'DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders',
                'CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'
            ];
            
            for (const triggerQuery of triggers) {
                await client.query(triggerQuery);
            }
            fixes.push('✅ تم إنشاء triggers للتحديث التلقائي');
            
        } catch (error) {
            fixes.push('⚠️ تحذير في triggers: ' + error.message);
        }
        
        await client.query('COMMIT');
        
        console.log('🎉 اكتمل إصلاح قاعدة البيانات بنجاح!');
        console.log('📋 الإصلاحات المطبقة:', fixes);
        
        res.json({
            success: true,
            message: 'تم إصلاح قاعدة البيانات بنجاح! 🎉',
            fixes: fixes,
            timestamp: new Date().toISOString(),
            note: 'يمكنك الآن استخدام جميع صفحات النظام بشكل طبيعي'
        });
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ خطأ في إصلاح قاعدة البيانات:', error);
        
        res.json({
            success: false,
            message: 'فشل في إصلاح قاعدة البيانات: ' + error.message,
            fixes: fixes || [],
            error: error.message
        });
    } finally {
        if (client) client.release();
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
            message: 'خطأ في رفع الملف: ' + error.message
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
        message: 'حدث خطأ في الخادم: ' + error.message
    });
});

module.exports = router;
