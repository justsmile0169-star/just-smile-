import fs from 'fs';
import path from 'path';

const files = fs.readdirSync('src/components');
files.forEach(file => {
  if (file.endsWith('.tsx')) {
    const content = fs.readFileSync(path.join('src/components', file), 'utf8');
    if (content.includes('status') && (content.includes('confirmed') || content.includes('shipped') || content.includes('preparing'))) {
      console.log(`Found in: src/components/${file}`);
    }
  }
});

if (fs.existsSync('src/App.tsx')) {
  const content = fs.readFileSync('src/App.tsx', 'utf8');
  if (content.includes('status') && (content.includes('confirmed') || content.includes('shipped') || content.includes('preparing'))) {
    console.log('Found in: src/App.tsx');
  }
}
