import fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('order') || line.includes('Order') || line.includes('status') || line.includes('Approve') || line.includes('Cancel') || line.includes('Ship')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
