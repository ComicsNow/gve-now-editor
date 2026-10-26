const Database = require('better-sqlite3');
const db = new Database(':memory:');

db.exec(`CREATE TABLE comics (id TEXT PRIMARY KEY)`);

const insert = db.prepare('INSERT INTO comics (id) VALUES (?)');
for (let i = 0; i < 10000; i++) {
    insert.run(`c${i}`);
}

const fileIds = [];
for (let i = 0; i < 5000; i++) {
    fileIds.push(`c${i}`);
}
for (let i = 0; i < 1000; i++) {
    fileIds.push(`o${i}`);
}

let total = fileIds.length;
let validCount = 0;
const BATCH_SIZE = 999;
for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT COUNT(id) as count FROM comics WHERE id IN (${placeholders})`);
    validCount += stmt.get(...batch).count;
}
console.log('Total:', total, 'Valid:', validCount, 'Orphans:', total - validCount);
