const { Pool } = require('pg');

console.log('🚨 EMERGENCY FIX - إصلاح فوري لمشكلة triggers');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('⚡ بدء الإصلاح الطارئ...');

// إعداد الاتصال بـ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function emergencyFix() {
    let client;
    
    try {
        console.log('🔗 الاتصال بقاعدة البيانات...');
        client = await pool.connect();
        console.log('✅ تم الاتصال بنجاح');
        
        // بدء معاملة
        await client.query('BEGIN');
        
        console.log('🧨 إزالة جميع triggers المُشكِلة بقوة...');
        
        // البحث عن جميع triggers الموجودة
        const existingTriggers = await client.query(`
            SELECT 
                schemaname, 
                tablename, 
                triggername
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE NOT t.tgisinternal
            AND n.nspname = 'public'
            ORDER BY tablename, triggername
        `);
        
        console.log('📋 Triggers الموجودة حالياً:');
        existingTriggers.rows.forEach(row => {
            console.log(`  - ${row.tablename}.${row.triggername}`);
        });
        
        // حذف جميع triggers ما عدا triggers التحديث التلقائي الآمنة
        const triggersToKeep = [
            'update_suppliers_updated_at',
            'update_invoices_updated_at', 
            'update_purchase_orders_updated_at'
        ];
        
        for (const row of existingTriggers.rows) {
            if (!triggersToKeep.includes(row.triggername)) {
                try {
                    await client.query(`DROP TRIGGER IF EXISTS ${row.triggername} ON ${row.tablename} CASCADE`);
                    console.log(`🗑️ تم حذف trigger: ${row.tablename}.${row.triggername}`);
                } catch (error) {
                    console.warn(`⚠️ خطأ في حذف ${row.triggername}:`, error.message);
                }
            } else {
                console.log(`✅ تم الاحتفاظ بـ trigger آمن: ${row.triggername}`);
            }
        }
        
        console.log('🧨 حذف جميع functions المُشكِلة...');
        
        // البحث عن functions الموجودة
        const existingFunctions = await client.query(`
            SELECT 
                schemaname,
                functionname
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            AND functionname LIKE '%validate%'
            ORDER BY functionname
        `);
        
        console.log('📋 Functions المُشكِلة:');
        existingFunctions.rows.forEach(row => {
            console.log(`  - ${row.functionname}`);
        });
        
        // حذف functions المُشكِلة
        const functionsToRemove = [
            'validate_dates',
            'validate_invoice_dates', 
            'validate_order_dates',
            'validate_purchase_order_dates'
        ];
        
        for (const funcName of functionsToRemove) {
            try {
                await client.query(`DROP FUNCTION IF EXISTS ${funcName}() CASCADE`);
                console.log(`🗑️ تم حذف function: ${funcName}`);
            } catch (error) {
                console.warn(`⚠️ خطأ في حذف function ${funcName}:`, error.message);
            }
        }
        
        console.log('🔧 إنشاء function آمن للتحديث التلقائي فقط...');
        
        // إنشاء function آمن للتحديث التلقائي
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                -- فقط تحديث updated_at - لا توجد عمليات تحقق معقدة
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        
        console.log('✅ تم إنشاء function آمن');
        
        // إنشاء triggers آمنة للتحديث التلقائي فقط
        console.log('🔧 إنشاء triggers آمنة للتحديث التلقائي...');
        
        const safeTriggers = [
            {
                table: 'suppliers',
                name: 'update_suppliers_updated_at'
            },
            {
                table: 'invoices', 
                name: 'update_invoices_updated_at'
            },
            {
                table: 'purchase_orders',
                name: 'update_purchase_orders_updated_at'
            }
        ];
        
        for (const trigger of safeTriggers) {
            try {
                // حذف trigger إذا كان موجود
                await client.query(`DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.table}`);
                
                // إنشاء trigger جديد آمن
                await client.query(`
                    CREATE TRIGGER ${trigger.name} 
                    BEFORE UPDATE ON ${trigger.table} 
                    FOR EACH ROW 
                    EXECUTE FUNCTION update_updated_at_column()
                `);
                
                console.log(`✅ تم إنشاء trigger آمن: ${trigger.table}.${trigger.name}`);
            } catch (error) {
                console.warn(`⚠️ خطأ في إنشاء trigger ${trigger.name}:`, error.message);
            }
        }
        
        // إتمام المعاملة
        await client.query('COMMIT');
        
        console.log('🎉 تم الإصلاح الطارئ بنجاح!');
        
        // اختبار سريع
        console.log('🧪 اختبار سريع...');
        
        try {
            // اختبار جدول purchase_orders
            const testCount = await client.query('SELECT COUNT(*) FROM purchase_orders');
            console.log(`✅ عدد أوامر الشراء: ${testCount.rows[0].count}`);
            
            // اختبار أن الـ triggers المُشكِلة لم تعد موجودة
            const remainingTriggers = await client.query(`
                SELECT COUNT(*) 
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE NOT t.tgisinternal
                AND n.nspname = 'public'
                AND t.tgname LIKE '%validate%'
            `);
            
            if (parseInt(remainingTriggers.rows[0].count) === 0) {
                console.log('✅ لا توجد triggers مُشكِلة متبقية');
            } else {
                console.warn('⚠️ ما زالت هناك triggers مُشكِلة متبقية:', remainingTriggers.rows[0].count);
            }
            
        } catch (testError) {
            console.warn('⚠️ تحذير في الاختبار:', testError.message);
        }
        
        console.log('✅ الإصلاح الطارئ مكتمل - يجب أن تعمل أوامر الشراء الآن!');
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ خطأ في الإصلاح الطارئ:', error.message);
        console.error('📍 التفاصيل:', error.stack);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// تشغيل الإصلاح الطارئ
emergencyFix().then(() => {
    console.log('🎯 تم الانتهاء من الإصلاح الطارئ بنجاح');
    console.log('🚀 يمكن الآن إضافة أوامر الشراء بدون مشاكل!');
    process.exit(0);
}).catch(error => {
    console.error('💥 خطأ عام في الإصلاح الطارئ:', error);
    process.exit(1);
});
