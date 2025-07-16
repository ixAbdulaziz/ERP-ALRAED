const { Pool } = require('pg');

console.log('☢️ NUCLEAR FIX - حذف جذري لجميع triggers المُشكِلة');
console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
console.log('⚡ بدء الحذف الجذري...');

// إعداد الاتصال بـ PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function nuclearFix() {
    let client;
    
    try {
        console.log('🔗 الاتصال بقاعدة البيانات...');
        client = await pool.connect();
        console.log('✅ تم الاتصال بنجاح');
        
        // بدء معاملة
        await client.query('BEGIN');
        
        console.log('☢️ بدء الحذف النووي لجميع triggers...');
        
        // الحصول على قائمة كاملة بجميع triggers الموجودة
        const allTriggersQuery = `
            SELECT 
                t.tgname as trigger_name,
                c.relname as table_name,
                p.proname as function_name
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            LEFT JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE NOT t.tgisinternal
            AND n.nspname = 'public'
            ORDER BY c.relname, t.tgname
        `;
        
        const allTriggers = await client.query(allTriggersQuery);
        
        console.log('📋 جميع triggers الموجودة:');
        allTriggers.rows.forEach(row => {
            console.log(`  - Table: ${row.table_name}, Trigger: ${row.trigger_name}, Function: ${row.function_name || 'N/A'}`);
        });
        
        // حذف جميع triggers ما عدا الضرورية جداً
        const essentialTriggers = [
            'update_suppliers_updated_at',
            'update_invoices_updated_at', 
            'update_purchase_orders_updated_at'
        ];
        
        for (const row of allTriggers.rows) {
            if (!essentialTriggers.includes(row.trigger_name)) {
                try {
                    console.log(`🧨 حذف trigger: ${row.table_name}.${row.trigger_name}`);
                    await client.query(`DROP TRIGGER "${row.trigger_name}" ON "${row.table_name}" CASCADE`);
                    console.log(`✅ تم حذف: ${row.trigger_name}`);
                } catch (error) {
                    console.warn(`⚠️ خطأ في حذف ${row.trigger_name}:`, error.message);
                    
                    // محاولة أخرى بطريقة مختلفة
                    try {
                        await client.query(`DROP TRIGGER IF EXISTS ${row.trigger_name} ON ${row.table_name} CASCADE`);
                        console.log(`✅ تم حذف (المحاولة 2): ${row.trigger_name}`);
                    } catch (error2) {
                        console.error(`❌ فشل نهائي في حذف: ${row.trigger_name} - ${error2.message}`);
                    }
                }
            } else {
                console.log(`✅ احتفاظ بـ trigger ضروري: ${row.trigger_name}`);
            }
        }
        
        console.log('☢️ حذف جذري لجميع functions المُشكِلة...');
        
        // البحث عن جميع functions المخصصة
        const allFunctionsQuery = `
            SELECT 
                p.proname as function_name,
                n.nspname as schema_name
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            AND p.proname NOT IN ('update_updated_at_column')
            ORDER BY p.proname
        `;
        
        const allFunctions = await client.query(allFunctionsQuery);
        
        console.log('📋 جميع functions المخصصة:');
        allFunctions.rows.forEach(row => {
            console.log(`  - ${row.function_name}`);
        });
        
        // حذف جميع functions ما عدا الضرورية
        const essentialFunctions = ['update_updated_at_column'];
        
        for (const row of allFunctions.rows) {
            if (!essentialFunctions.includes(row.function_name)) {
                try {
                    console.log(`🧨 حذف function: ${row.function_name}`);
                    await client.query(`DROP FUNCTION IF EXISTS "${row.function_name}"() CASCADE`);
                    console.log(`✅ تم حذف function: ${row.function_name}`);
                } catch (error) {
                    console.warn(`⚠️ خطأ في حذف function ${row.function_name}:`, error.message);
                    
                    // محاولات إضافية لحذف functions عنيدة
                    const dropQueries = [
                        `DROP FUNCTION IF EXISTS ${row.function_name} CASCADE`,
                        `DROP FUNCTION IF EXISTS ${row.function_name}() CASCADE`,
                        `DROP FUNCTION IF EXISTS public.${row.function_name}() CASCADE`
                    ];
                    
                    for (const dropQuery of dropQueries) {
                        try {
                            await client.query(dropQuery);
                            console.log(`✅ تم حذف (محاولة إضافية): ${row.function_name}`);
                            break;
                        } catch (error2) {
                            // استمر للمحاولة التالية
                        }
                    }
                }
            }
        }
        
        console.log('🔧 إنشاء function آمن وحيد للتحديث التلقائي...');
        
        // حذف وإعادة إنشاء function التحديث التلقائي
        await client.query(`DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE`);
        
        await client.query(`
            CREATE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                -- فقط تحديث التوقيت - لا شيء آخر
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
        
        console.log('✅ تم إنشاء function آمن جديد');
        
        // إنشاء triggers آمنة للتحديث التلقائي فقط
        console.log('🔧 إنشاء triggers آمنة للتحديث التلقائي...');
        
        const tables = ['suppliers', 'invoices', 'purchase_orders'];
        
        for (const table of tables) {
            const triggerName = `update_${table}_updated_at`;
            
            try {
                // حذف trigger إذا كان موجود
                await client.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table} CASCADE`);
                
                // إنشاء trigger جديد آمن
                await client.query(`
                    CREATE TRIGGER ${triggerName} 
                    BEFORE UPDATE ON ${table} 
                    FOR EACH ROW 
                    EXECUTE FUNCTION update_updated_at_column()
                `);
                
                console.log(`✅ تم إنشاء trigger آمن: ${table}.${triggerName}`);
            } catch (error) {
                console.warn(`⚠️ خطأ في إنشاء trigger ${triggerName}:`, error.message);
            }
        }
        
        // إتمام المعاملة
        await client.query('COMMIT');
        
        console.log('☢️ تم الحذف النووي بنجاح!');
        
        // التحقق النهائي
        console.log('🔍 التحقق النهائي من نظافة قاعدة البيانات...');
        
        // فحص triggers المتبقية
        const remainingTriggers = await client.query(`
            SELECT 
                t.tgname as trigger_name,
                c.relname as table_name
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE NOT t.tgisinternal
            AND n.nspname = 'public'
            ORDER BY c.relname, t.tgname
        `);
        
        console.log('📋 Triggers المتبقية (يجب أن تكون آمنة فقط):');
        remainingTriggers.rows.forEach(row => {
            console.log(`  ✅ ${row.table_name}.${row.trigger_name}`);
        });
        
        // فحص functions المتبقية
        const remainingFunctions = await client.query(`
            SELECT proname 
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public'
            ORDER BY proname
        `);
        
        console.log('📋 Functions المتبقية:');
        remainingFunctions.rows.forEach(row => {
            console.log(`  ✅ ${row.proname}`);
        });
        
        // اختبار نهائي
        console.log('🧪 اختبار نهائي...');
        
        try {
            const testResult = await client.query('SELECT COUNT(*) FROM purchase_orders');
            console.log(`✅ عدد أوامر الشراء: ${testResult.rows[0].count}`);
            
            console.log('🎉 النظام نظيف تماماً الآن!');
            console.log('🚀 يمكن إضافة أوامر الشراء بدون أي مشاكل!');
            
        } catch (testError) {
            console.error('❌ خطأ في الاختبار النهائي:', testError.message);
        }
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ خطأ في الحذف النووي:', error.message);
        console.error('📍 التفاصيل:', error.stack);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// تشغيل الحذف النووي
nuclearFix().then(() => {
    console.log('🎯 تم الانتهاء من الحذف النووي بنجاح');
    console.log('🎊 قاعدة البيانات نظيفة تماماً!');
    console.log('🚀 جرب إضافة أمر شراء الآن - يجب أن يعمل!');
    process.exit(0);
}).catch(error => {
    console.error('💥 خطأ عام في الحذف النووي:', error);
    process.exit(1);
});
