import fs from 'node:fs';
import path from 'node:path';

const BUDGET_KB = 500; // Total chunks budget in KB
const CHUNKS_DIR = '.next/static/chunks';

function getDirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    let size = 0;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            size += getDirSize(filePath);
        } else {
            size += stats.size;
        }
    }
    return size;
}

const totalSize = getDirSize(CHUNKS_DIR);
const totalSizeKB = (totalSize / 1024).toFixed(2);

console.log(`--- Performance Budget Check ---`);
console.log(`Total Chunks Size: ${totalSizeKB} KB`);
console.log(`Budget: ${BUDGET_KB} KB`);

if (totalSizeKB > BUDGET_KB) {
    console.error(`❌ Performance Budget Exceeded!`);
    process.exit(1);
} else {
    console.log(`✅ Performance Budget OK!`);
}
