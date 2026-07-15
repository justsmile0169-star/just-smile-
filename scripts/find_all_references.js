import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist' && f !== '.gemini' && f !== 'algeria-cities-master') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

walkDir('src', (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.toLowerCase().includes('order') || content.includes('orders')) {
    const lines = content.split('\n');
    let count = 0;
    lines.forEach(line => {
      if (line.includes('orders') || line.includes('Order') || line.includes('status')) {
        count++;
      }
    });
    console.log(`${filePath}: ${count} matches`);
  }
});
