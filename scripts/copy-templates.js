const fs = require('fs');
const path = require('path');

// 递归复制目录
function copyDir(src, dest) {
    // 创建目标目录
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    // 读取源目录
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // 递归复制子目录
            copyDir(srcPath, destPath);
        } else {
            // 复制文件
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 主函数
function main() {
    const srcDir = path.join(__dirname, '..', 'src', 'templates');
    const destDir = path.join(__dirname, '..', 'dist', 'templates');
    
    try {
        copyDir(srcDir, destDir);
        console.log('Templates copied successfully!');
    } catch (err) {
        console.error('Error copying templates:', err);
        process.exit(1);
    }
}

main();
