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
                contact_info TEXT,
                address TEXT,
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
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول الفواتير جاهز');

        // جدول أوامر الشراء - محدث مع file_path
        await pool.query(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(100) UNIQUE,
                supplier_name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                order_date DATE DEFAULT CURRENT_DATE,
                delivery_date DATE,
                notes TEXT,
                file_path VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول أوامر الشراء جاهز');

        // جدول المدفوعات
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                supplier_name VARCHAR(255) NOT NULL,
                payment_date DATE NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                payment_method VARCHAR(100) DEFAULT 'cash',
                reference_number VARCHAR(100),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ جدول المدفوعات جاهز');

        // جدول ربط الفواتير بأوامر الشراء
        await pool.query(`
            CREATE TABLE IF NOT EXISTS invoice_purchase_order_links (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
                purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
                linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(invoice_id, purchase_order_id)
            )
        `);
        console.log('✅ جدول ربط الفواتير بأوامر الشراء جاهز');

        // إضافة حقل file_path لجدول purchase_orders إذا لم يكن موجوداً (تحديث للجداول الموجودة)
        try {
            await pool.query(`
                ALTER TABLE purchase_orders 
                ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)
            `);
            console.log('✅ تم تحديث جدول أوامر الشراء بإضافة حقل file_path');
        } catch (error) {
            console.log('ℹ️ حقل file_path موجود بالفعل في جدول أوامر الشراء');
        }

        // إضافة indexes لتحسين الأداء
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_supplier_name ON invoices(supplier_name);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_supplier_name ON payments(supplier_name);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_name ON purchase_orders(supplier_name);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_invoice_purchase_order_links_invoice_id ON invoice_purchase_order_links(invoice_id);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_invoice_purchase_order_links_purchase_order_id ON invoice_purchase_order_links(purchase_order_id);
        `);
        console.log('✅ تم إنشاء جميع الفهارس المحسنة');

        // إضافة trigger لتحديث updated_at
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
            CREATE TRIGGER update_invoices_updated_at 
                BEFORE UPDATE ON invoices 
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
            CREATE TRIGGER update_purchase_orders_updated_at 
                BEFORE UPDATE ON purchase_orders 
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
        console.log('✅ تم إنشاء triggers التحديث التلقائي');

        // إدراج بيانات تجريبية (اختياري - سيتم تجاهل إذا كانت البيانات موجودة)
        await insertSampleData();
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error.message);
        throw error;
    }
}

// إدراج بيانات تجريبية
async function insertSampleData() {
    try {
        // التحقق من وجود بيانات
        const suppliersCount = await pool.query('SELECT COUNT(*) FROM suppliers');
        const ordersCount = await pool.query('SELECT COUNT(*) FROM purchase_orders');
        
        // إذا لم توجد بيانات، أدرج بيانات تجريبية
        if (parseInt(suppliersCount.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO suppliers (name, contact_info, address) VALUES 
                ('شركة الإمدادات الذكية', 'هاتف: 0123456789', 'الرياض، المملكة العربية السعودية'),
                ('مؤسسة التقنية المتقدمة', 'هاتف: 0123456788', 'جدة، المملكة العربية السعودية'),
                ('شركة الحلول المبتكرة', 'هاتف: 0123456787', 'الدمام، المملكة العربية السعودية')
                ON CONFLICT (name) DO NOTHING
            `);
            console.log('✅ تم إدراج موردين تجريبيين');
        }

        if (parseInt(ordersCount.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO purchase_orders (order_number, supplier_name, description, amount, status, order_date, notes) VALUES 
                ('PO-0001', 'شركة الإمدادات الذكية', 'شراء معدات مكتبية متنوعة للفرع الجديد', 15000.00, 'pending', CURRENT_DATE - INTERVAL '5 days', 'أمر شراء عاجل، مطلوب التسليم خلال أسبوع'),
                ('PO-0002', 'مؤسسة التقنية المتقدمة', 'أجهزة كمبيوتر وملحقاتها للقسم الإداري', 45000.00, 'approved', CURRENT_DATE - INTERVAL '3 days', 'تم اعتماد الأمر، في انتظار التسليم'),
                ('PO-0003', 'شركة الحلول المبتكرة', 'برامج وتراخيص للنظام الجديد', 12000.00, 'completed', CURRENT_DATE - INTERVAL '1 day', 'تم التسليم والتركيب بالكامل')
                ON CONFLICT (order_number) DO NOTHING
            `);
            console.log('✅ تم إدراج أوامر شراء تجريبية');
        }
        
    } catch (error) {
        console.log('ℹ️ تجاهل إدراج البيانات التجريبية (قد تكون موجودة بالفعل)');
    }
}

// ============== وظائف الموردين ==============

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

// جلب بيانات الموردين مع إحصائياتهم
async function getSuppliersWithStats() {
    try {
        const result = await pool.query(`
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
                s.created_at
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            LEFT JOIN payments p ON s.name = p.supplier_name
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name
            GROUP BY s.id, s.name, s.contact_info, s.address, s.created_at
            ORDER BY s.created_at DESC
        `);
        
        return result.rows.map(row => ({
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
            created_at: row.created_at
        }));
    } catch (error) {
        console.error('خطأ في جلب الموردين مع الإحصائيات:', error);
        throw error;
    }
}

// إضافة مورد جديد
async function addSupplier(supplierData) {
    try {
        const { name, contact_info, address } = supplierData;
        
        const result = await pool.query(
            'INSERT INTO suppliers (name, contact_info, address) VALUES ($1, $2, $3) RETURNING *',
            [name, contact_info || null, address || null]
        );
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة مورد:', error);
        throw error;
    }
}

// تحديث معلومات مورد
async function updateSupplier(supplierId, supplierData) {
    try {
        const { name, contact_info, address } = supplierData;
        
        const result = await pool.query(`
            UPDATE suppliers 
            SET name = $1, contact_info = $2, address = $3
            WHERE id = $4 
            RETURNING *
        `, [name, contact_info || null, address || null, supplierId]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في تحديث المورد:', error);
        throw error;
    }
}

// ============== وظائف الفواتير ==============

// جلب جميع الفواتير مع إمكانية الفلترة
async function getAllInvoices(filters = {}) {
    try {
        let query = 'SELECT * FROM invoices WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (filters.supplier_name) {
            query += ` AND supplier_name = $${paramIndex}`;
            params.push(filters.supplier_name);
            paramIndex++;
        }
        
        if (filters.date_from) {
            query += ` AND invoice_date >= $${paramIndex}`;
            params.push(filters.date_from);
            paramIndex++;
        }
        
        if (filters.date_to) {
            query += ` AND invoice_date <= $${paramIndex}`;
            params.push(filters.date_to);
            paramIndex++;
        }
        
        if (filters.status) {
            query += ` AND status = $${paramIndex}`;
            params.push(filters.status);
            paramIndex++;
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب الفواتير:', error);
        throw error;
    }
}

// جلب أحدث الفواتير
async function getRecentInvoices(limit = 5) {
    try {
        const result = await pool.query(`
            SELECT 
                id, invoice_number, supplier_name, total_amount, 
                invoice_date, created_at, status
            FROM invoices 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب أحدث الفواتير:', error);
        throw error;
    }
}

// جلب فاتورة محددة
async function getInvoiceById(invoiceId) {
    try {
        const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في جلب الفاتورة:', error);
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

// تحديث فاتورة
async function updateInvoice(invoiceId, invoiceData) {
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
            file_path,
            status
        } = invoiceData;
        
        const result = await pool.query(`
            UPDATE invoices SET
                invoice_number = $1,
                supplier_name = $2,
                invoice_type = $3,
                category = $4,
                invoice_date = $5,
                amount_before_tax = $6,
                tax_amount = $7,
                total_amount = $8,
                notes = $9,
                file_path = $10,
                status = $11
            WHERE id = $12
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
            file_path || '',
            status || 'pending',
            invoiceId
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في تحديث فاتورة:', error);
        throw error;
    }
}

// حذف فاتورة
async function deleteInvoice(invoiceId) {
    try {
        const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [invoiceId]);
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في حذف فاتورة:', error);
        throw error;
    }
}

// ============== وظائف المدفوعات ==============

// جلب مدفوعات مورد محدد
async function getPaymentsBySupplier(supplierName) {
    try {
        const result = await pool.query(`
            SELECT * FROM payments 
            WHERE supplier_name = $1 
            ORDER BY payment_date DESC
        `, [supplierName]);
        
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب المدفوعات:', error);
        throw error;
    }
}

// إضافة دفعة جديدة
async function addPayment(paymentData) {
    try {
        const {
            supplier_name,
            payment_date,
            amount,
            payment_method,
            reference_number,
            notes
        } = paymentData;
        
        const result = await pool.query(`
            INSERT INTO payments 
            (supplier_name, payment_date, amount, payment_method, reference_number, notes) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *
        `, [
            supplier_name,
            payment_date,
            amount,
            payment_method || 'cash',
            reference_number || null,
            notes || ''
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة دفعة:', error);
        throw error;
    }
}

// حذف دفعة
async function deletePayment(paymentId) {
    try {
        const result = await pool.query('DELETE FROM payments WHERE id = $1 RETURNING *', [paymentId]);
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في حذف دفعة:', error);
        throw error;
    }
}

// ============== وظائف أوامر الشراء - محدثة ==============

// جلب جميع أوامر الشراء مع إمكانية الفلترة
async function getAllPurchaseOrders(filters = {}) {
    try {
        let query = 'SELECT * FROM purchase_orders WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (filters.supplier_name) {
            query += ` AND supplier_name = $${paramIndex}`;
            params.push(filters.supplier_name);
            paramIndex++;
        }
        
        if (filters.status) {
            query += ` AND status = $${paramIndex}`;
            params.push(filters.status);
            paramIndex++;
        }
        
        if (filters.date_from) {
            query += ` AND order_date >= $${paramIndex}`;
            params.push(filters.date_from);
            paramIndex++;
        }
        
        if (filters.date_to) {
            query += ` AND order_date <= $${paramIndex}`;
            params.push(filters.date_to);
            paramIndex++;
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب أوامر الشراء:', error);
        throw error;
    }
}

// جلب أمر شراء محدد
async function getPurchaseOrderById(orderId) {
    try {
        const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [orderId]);
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في جلب أمر الشراء:', error);
        throw error;
    }
}

// جلب أوامر شراء مورد محدد
async function getPurchaseOrdersBySupplier(supplierName) {
    try {
        const result = await pool.query(`
            SELECT * FROM purchase_orders 
            WHERE supplier_name = $1 
            ORDER BY created_at DESC
        `, [supplierName]);
        
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب أوامر الشراء:', error);
        throw error;
    }
}

// إضافة أمر شراء جديد
async function addPurchaseOrder(orderData) {
    try {
        const { 
            order_number,
            supplier_name, 
            description, 
            amount,
            status,
            order_date,
            delivery_date,
            notes,
            file_path
        } = orderData;
        
        const result = await pool.query(`
            INSERT INTO purchase_orders 
            (order_number, supplier_name, description, amount, status, order_date, delivery_date, notes, file_path) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING *
        `, [
            order_number || null,
            supplier_name,
            description,
            amount,
            status || 'pending',
            order_date || new Date(),
            delivery_date || null,
            notes || '',
            file_path || null
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إضافة أمر شراء:', error);
        throw error;
    }
}

// تحديث أمر شراء
async function updatePurchaseOrder(orderId, orderData) {
    try {
        const {
            order_number,
            supplier_name,
            description,
            amount,
            status,
            order_date,
            delivery_date,
            notes,
            file_path
        } = orderData;
        
        const result = await pool.query(`
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
            RETURNING *
        `, [
            order_number,
            supplier_name,
            description,
            amount,
            status || 'pending',
            order_date,
            delivery_date,
            notes || '',
            file_path,
            orderId
        ]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في تحديث أمر شراء:', error);
        throw error;
    }
}

// حذف أمر شراء
async function deletePurchaseOrder(orderId) {
    try {
        const result = await pool.query('DELETE FROM purchase_orders WHERE id = $1 RETURNING *', [orderId]);
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في حذف أمر شراء:', error);
        throw error;
    }
}

// ============== وظائف ربط الفواتير مع أوامر الشراء - جديدة ==============

// جلب الفواتير المرتبطة بأمر شراء محدد
async function getInvoicesLinkedToPurchaseOrder(orderId) {
    try {
        const result = await pool.query(`
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
        `, [orderId]);
        
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب الفواتير المرتبطة:', error);
        throw error;
    }
}

// ربط فاتورة بأمر شراء
async function linkInvoiceToPurchaseOrder(invoiceId, orderId) {
    try {
        const result = await pool.query(`
            INSERT INTO invoice_purchase_order_links (invoice_id, purchase_order_id)
            VALUES ($1, $2)
            ON CONFLICT (invoice_id, purchase_order_id) DO NOTHING
            RETURNING *
        `, [invoiceId, orderId]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في ربط الفاتورة:', error);
        throw error;
    }
}

// إلغاء ربط فاتورة من أمر شراء
async function unlinkInvoiceFromPurchaseOrder(invoiceId, orderId) {
    try {
        const result = await pool.query(`
            DELETE FROM invoice_purchase_order_links 
            WHERE invoice_id = $1 AND purchase_order_id = $2
            RETURNING *
        `, [invoiceId, orderId]);
        
        return result.rows[0];
    } catch (error) {
        console.error('خطأ في إلغاء ربط الفاتورة:', error);
        throw error;
    }
}

// حساب الموازنة لأمر شراء محدد
async function calculatePurchaseOrderBudget(orderId) {
    try {
        // جلب معلومات أمر الشراء
        const orderResult = await pool.query(
            'SELECT amount FROM purchase_orders WHERE id = $1',
            [orderId]
        );
        
        if (orderResult.rows.length === 0) {
            return null;
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
        
        return {
            order_amount: orderAmount,
            total_invoices_amount: totalInvoicesAmount,
            balance: balance,
            balance_percentage: Math.round(balancePercentage * 100) / 100,
            balance_status: balanceStatus,
            invoices_count: invoicesCount
        };
    } catch (error) {
        console.error('خطأ في حساب الموازنة:', error);
        throw error;
    }
}

// ============== وظائف الإحصائيات - محدثة ==============

// جلب إحصائيات النظام العامة
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
        
        // إجمالي المبالغ
        const totalAmountResult = await pool.query('SELECT SUM(total_amount) as total FROM invoices');
        stats.totalAmount = parseFloat(totalAmountResult.rows[0].total) || 0;
        
        // إجمالي المدفوعات
        const totalPaidResult = await pool.query('SELECT SUM(amount) as total FROM payments');
        stats.totalPaid = parseFloat(totalPaidResult.rows[0].total) || 0;
        
        // الرصيد المتبقي
        stats.balance = stats.totalAmount - stats.totalPaid;
        
        // إحصائيات أوامر الشراء
        const ordersStatsResult = await pool.query(`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_orders,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                SUM(amount) as total_orders_amount
            FROM purchase_orders
        `);
        
        const ordersStats = ordersStatsResult.rows[0];
        stats.pendingOrders = parseInt(ordersStats.pending_orders) || 0;
        stats.approvedOrders = parseInt(ordersStats.approved_orders) || 0;
        stats.completedOrders = parseInt(ordersStats.completed_orders) || 0;
        stats.cancelledOrders = parseInt(ordersStats.cancelled_orders) || 0;
        stats.totalOrdersAmount = parseFloat(ordersStats.total_orders_amount) || 0;
        
        return stats;
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        throw error;
    }
}

// جلب إحصائيات مورد محدد
async function getSupplierStats(supplierName) {
    try {
        const result = await pool.query(`
            SELECT 
                s.name,
                COUNT(DISTINCT i.id) as invoice_count,
                COALESCE(SUM(i.total_amount), 0) as total_amount,
                COUNT(DISTINCT p.id) as payment_count,
                COALESCE(SUM(p.amount), 0) as total_paid,
                COUNT(DISTINCT po.id) as purchase_orders_count,
                COALESCE(SUM(po.amount), 0) as purchase_orders_total
            FROM suppliers s
            LEFT JOIN invoices i ON s.name = i.supplier_name
            LEFT JOIN payments p ON s.name = p.supplier_name
            LEFT JOIN purchase_orders po ON s.name = po.supplier_name
            WHERE s.name = $1
            GROUP BY s.name
        `, [supplierName]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        return {
            supplier_name: row.name,
            invoice_count: parseInt(row.invoice_count),
            total_amount: parseFloat(row.total_amount),
            payment_count: parseInt(row.payment_count),
            total_paid: parseFloat(row.total_paid),
            balance: parseFloat(row.total_amount) - parseFloat(row.total_paid),
            purchase_orders_count: parseInt(row.purchase_orders_count),
            purchase_orders_total: parseFloat(row.purchase_orders_total)
        };
    } catch (error) {
        console.error('خطأ في جلب إحصائيات المورد:', error);
        throw error;
    }
}

// ============== وظائف التقارير ==============

// تقرير مالي شامل
async function getFinancialReport(dateFrom, dateTo) {
    try {
        const result = await pool.query(`
            SELECT 
                'invoices' as type,
                supplier_name,
                SUM(total_amount) as amount,
                COUNT(*) as count,
                DATE_TRUNC('month', invoice_date) as period
            FROM invoices
            WHERE invoice_date BETWEEN $1 AND $2
            GROUP BY supplier_name, DATE_TRUNC('month', invoice_date)
            
            UNION ALL
            
            SELECT 
                'payments' as type,
                supplier_name,
                SUM(amount) as amount,
                COUNT(*) as count,
                DATE_TRUNC('month', payment_date) as period
            FROM payments
            WHERE payment_date BETWEEN $1 AND $2
            GROUP BY supplier_name, DATE_TRUNC('month', payment_date)
            
            UNION ALL
            
            SELECT 
                'purchase_orders' as type,
                supplier_name,
                SUM(amount) as amount,
                COUNT(*) as count,
                DATE_TRUNC('month', order_date) as period
            FROM purchase_orders
            WHERE order_date BETWEEN $1 AND $2
            GROUP BY supplier_name, DATE_TRUNC('month', order_date)
            
            ORDER BY supplier_name, period
        `, [dateFrom, dateTo]);
        
        return result.rows;
    } catch (error) {
        console.error('خطأ في جلب التقرير المالي:', error);
        throw error;
    }
}

// تهيئة قاعدة البيانات عند بدء التشغيل
initializeDatabase();

// تصدير قاعدة البيانات والوظائف
module.exports = {
    pool,
    initializeDatabase,
    
    // وظائف الموردين
    getAllSuppliers,
    getSuppliersWithStats,
    addSupplier,
    updateSupplier,
    
    // وظائف الفواتير
    getAllInvoices,
    getRecentInvoices,
    getInvoiceById,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    
    // وظائف المدفوعات
    getPaymentsBySupplier,
    addPayment,
    deletePayment,
    
    // وظائف أوامر الشراء - محدثة
    getAllPurchaseOrders,
    getPurchaseOrderById,
    getPurchaseOrdersBySupplier,
    addPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    
    // وظائف ربط الفواتير مع أوامر الشراء - جديدة
    getInvoicesLinkedToPurchaseOrder,
    linkInvoiceToPurchaseOrder,
    unlinkInvoiceFromPurchaseOrder,
    calculatePurchaseOrderBudget,
    
    // وظائف الإحصائيات
    getStats,
    getSupplierStats,
    getFinancialReport
};
