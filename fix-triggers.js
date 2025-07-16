const { Pool } = require('pg');

console.log('🔧 بدء إصلاح مشكلة triggers قاعدة البيانات...');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));

// إعداد الاتصال بـ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixTriggers() {
    let client;
    
    try {
        console.log('🔗 الاتصال بقاعدة البيانات...');
        client = await pool.connect();
        
        console.log('✅ تم الاتصال بنجاح');
        
        // بدء معاملة
        await client.query('BEGIN');
        
        console.log('🧹 إزالة triggers والfunctions المُسببة للمشاكل...');
        
        // قائمة الـ triggers والـ functions التي تحتاج إزالة
        const itemsToRemove = [
            'DROP TRIGGER IF EXISTS validate_invoice_dates ON invoices',
            'DROP TRIGGER IF EXISTS validate_purchase_order_dates ON purchase_orders', 
            'DROP TRIGGER IF EXISTS validate_dates_trigger ON invoices',
            'DROP TRIGGER IF EXISTS validate_dates_trigger ON purchase_orders',
            'DROP TRIGGER IF EXISTS validate_order_dates_trigger ON purchase_orders',
            'DROP TRIGGER IF EXISTS validate_invoice_dates_trigger ON invoices',
            'DROP FUNCTION IF EXISTS validate_dates() CASCADE',
            'DROP FUNCTION IF EXISTS validate_invoice_dates() CASCADE',
            'DROP FUNCTION IF EXISTS validate_order_dates() CASCADE'
        ];
        
        for (const dropQuery of itemsToRemove) {
            try {
                await client.query(dropQuery);
                console.log(`✅ تم تنفيذ: ${dropQuery.split(' ')[2]} ${dropQuery.split(' ')[5] || ''}`);
            } catch (error) {
                if (!error.message.includes('does not exist')) {
                    console.warn(`⚠️ تحذير في: ${dropQuery} - ${error.message}`);
                }
            }
        }
        
        console.log('🔧 إنشاء function آمن للتحديث التلقائي...');
        
        // إنشاء function آمن للتحديث التلقائي فقط
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        
        console.log('✅ تم إنشاء function التحديث التلقائي');
        
        // إنشاء triggers آمنة للتحديث التلقائي فقط
        const safeTriggers = [
            'DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers',
            'CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            
            'DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices', 
            'CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
            
            'DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders',
            'CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'
        ];
        
        for (const triggerQuery of safeTriggers) {
            try {
                await client.query(triggerQuery);
                console.log('✅ تم إنشاء trigger آمن');
            } catch (error) {
                console.warn('⚠️ تحذير في إنشاء trigger:', error.message);
            }
        }
        
        // إتمام المعاملة
        await client.query('COMMIT');
        
        console.log('🎉 تم إصلاح مشكلة triggers بنجاح!');
        
        // اختبار سريع
        console.log('🧪 اختبار سريع...');
        
        try {
            const testResult = await client.query('SELECT COUNT(*) FROM purchase_orders');
            console.log(`✅ عدد أوامر الشراء: ${testResult.rows[0].count}`);
        } catch (testError) {
            console.warn('⚠️ تحذير في الاختبار:', testError.message);
        }
        
        console.log('✅ تم الانتهاء من إصلاح المشكلة');
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ خطأ في إصلاح triggers:', error.message);
        console.error('📍 التفاصيل:', error.stack);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// تشغيل الإصلاح
fixTriggers().then(() => {
    console.log('🎯 تم الانتهاء من العملية بنجاح');
    process.exit(0);
}).catch(error => {
    console.error('💥 خطأ عام:', error);
    process.exit(1);
});
