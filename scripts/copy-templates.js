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

// 复制单个文件
function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
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

    // 复制 onnxruntime-web WASM 和 backend JS 到 dist/templates/ort/
    try {
        const ortDistDir = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
        const ortDestDir = path.join(destDir, 'ort');
        const filesToCopy = [
            'ort-wasm-simd-threaded.wasm',
            'ort-wasm-simd-threaded.mjs',
            'ort-wasm-simd-threaded.jsep.mjs',
        ];

        for (const file of filesToCopy) {
            const src = path.join(ortDistDir, file);
            const dest = path.join(ortDestDir, file);
            if (fs.existsSync(src)) {
                copyFile(src, dest);
                console.log(`ONNX Runtime copied: ${file}`);
            } else {
                console.warn(`File not found: ${src}`);
            }
        }
    } catch (err) {
        console.error('Error copying ONNX Runtime files:', err);
    }
}

main();
