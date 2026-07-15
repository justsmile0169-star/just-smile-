import fs from 'fs';
const data = JSON.parse(fs.readFileSync('algeria-cities-master/json/algeria_cities.json', 'utf8'));
const djelfaCities = data.filter(c => c.wilaya_code === '17' || c.wilaya_name_ascii.toLowerCase().includes('djelfa') || c.wilaya_name.includes('جلفة'));
console.log('Djelfa cities count:', djelfaCities.length);
if (djelfaCities.length > 0) {
  console.log('Sample city:', djelfaCities[0]);
  console.log('All unique commune names in Djelfa:');
  const communes = [...new Set(djelfaCities.map(c => `${c.commune_name_ascii} / ${c.commune_name}`))];
  console.log(communes);
} else {
  console.log('No Djelfa cities found!');
  // Let's print some wilayas to see what we have
  const wilayas = [...new Set(data.map(c => `${c.wilaya_code}: ${c.wilaya_name_ascii} / ${c.wilaya_name}`))];
  console.log('All wilayas in JSON:', wilayas);
}
