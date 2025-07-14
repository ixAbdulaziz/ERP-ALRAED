const express = require('express');
const router = express.Router();

// اختبار API بسيط
router.get('/test', (req, res) => {
    try {
        res.json({
            success: true,
            message: 'APIs تعمل بنجاح مع PostgreSQL!',
            database: 'PostgreSQL',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('خطأ في API اختبار:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في API',
            error: error.message
        });
    }
});

// API إحصائيات بسيطة (للاختبار)
router.get('/stats', async (req, res) => {
    try {
        // إحصائيات وهمية للاختبار
        const stats = {
            suppliersCount: 0,
            invoicesCount: 0,
            ordersCount: 0,
            totalAmount: 0
        };
        
        console.log('📊 تم جلب الإحصائيات:', stats);
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            error: error.message
        });
    }
});

// API موردين فارغ (للاختبار)
router.get('/suppliers-with-stats', async (req, res) => {
    try {
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الموردين',
            error: error.message
        });
    }
});

// API فواتير فارغة (للاختبار)
router.get('/recent-invoices', async (req, res) => {
    try {
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الفواتير',
            error: error.message
        });
    }
});

console.log('✅ تم تحميل APIs المبسطة');

module.exports = router;
