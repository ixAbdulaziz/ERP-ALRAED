const fs = require('fs');
const path = require('path');

console.log('🔧 بدء إنشاء مجلد uploads...');

// إنشاء مجلد uploads
const uploadsDir = path.join(__dirname, 'uploads');

try {
    // التحقق من وجود المجلد
    if (!fs.existsSync(uploadsDir)) {
        // إنشاء المجلد
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ تم إنشاء مجلد uploads');
    } else {
        console.log('✅ مجلد uploads موجود بالفعل');
    }

    // إنشاء ملف .gitkeep لضمان رفع المجلد إلى git
    const gitkeepPath = path.join(uploadsDir, '.gitkeep');
    if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '');
        console.log('✅ تم إنشاء .gitkeep في مجلد uploads');
    } else {
        console.log('✅ ملف .gitkeep موجود');
    }

    // التحقق من صلاحيات الكتابة
    try {
        const testFile = path.join(uploadsDir, 'test-write.tmp');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('✅ صلاحيات الكتابة في مجلد uploads صحيحة');
    } catch (writeError) {
        console.error('❌ خطأ في صلاحيات الكتابة:', writeError.message);
        process.exit(1);
    }

    // عرض معلومات المجلد
    const stats = fs.statSync(uploadsDir);
    console.log('📂 معلومات مجلد uploads:');
    console.log('   - المسار:', uploadsDir);
    console.log('   - تاريخ الإنشاء:', stats.birthtime);
    console.log('   - الصلاحيات:', stats.mode.toString(8));

    console.log('🎉 تم إعداد مجلد uploads بنجاح!');
    
} catch (error) {
    console.error('❌ خطأ في إنشاء مجلد uploads:', error.message);
    console.error('📍 التفاصيل:', error);
    
    // محاولة إصلاح المشكلة
    console.log('🔧 محاولة إصلاح المشكلة...');
    
    try {
        // حذف المجلد إذا كان موجوداً ولكن فيه مشكلة
        if (fs.existsSync(uploadsDir)) {
            fs.rmSync(uploadsDir, { recursive: true, force: true });
            console.log('🗑️ تم حذف المجلد التالف');
        }
        
        // إعادة إنشاء المجلد
        fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
        fs.writeFileSync(path.join(uploadsDir, '.gitkeep'), '');
        
        console.log('✅ تم إصلاح المشكلة وإنشاء المجلد بنجاح');
        
    } catch (fixError) {
        console.error('❌ فشل في إصلاح المشكلة:', fixError.message);
        process.exit(1);
    }
}
