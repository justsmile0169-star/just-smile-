import fs from 'fs';
const content = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const matches = content.match(/activeSubTab === '[a-zA-Z]+'/g);
console.log('Matches:', [...new Set(matches)]);
