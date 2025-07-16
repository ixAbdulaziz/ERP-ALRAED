const fs = require('fs');
const path = require('path');

// إنشاء مجلد uploads
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ تم إنشاء مجلد uploads');
} else {
    console.log('✅ مجلد uploads موجود');
}

// إنشاء ملف .gitkeep لضمان رفع المجلد إلى git
const gitkeepPath = path.join(uploadsDir, '.gitkeep');
if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
    console.log('✅ تم إنشاء .gitkeep في مجلد uploads');
}

console.log('🎉 تم إعداد مجلد uploads بنجاح!');
