import fs from 'fs';
const content = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('ordersList') || line.includes('handleApproveOrder') || line.includes('OrderCard') || line.includes('activeSubTab === \'orders\'') || line.includes('status') && line.includes('confirmed')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
