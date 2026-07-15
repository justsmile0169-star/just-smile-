import fs from 'fs';
import path from 'path';

function searchFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('orders') && (line.includes('status') || line.includes('updateDoc') || line.includes('confirmed') || line.includes('preparing') || line.includes('shipped'))) {
      console.log(`${filePath}:${index + 1}: ${line.trim()}`);
    }
  });
}

searchFile('src/components/AdminDashboard.tsx');
if (fs.existsSync('src/App.tsx')) {
  searchFile('src/App.tsx');
}
