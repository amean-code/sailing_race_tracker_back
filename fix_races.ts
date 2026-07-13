import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:password@localhost:5432/sailing_race_tracker',
});

async function main() {
  await ds.initialize();
  await ds.query(`UPDATE races SET title = 'Bodrum Körfezi Offshore', location = 'Bodrum, Muğla' WHERE description LIKE '%Bodrum körfezinde%'`);
  await ds.query(`UPDATE races SET title = 'Datça Peninsula Sailing Challenge 2026', location = 'Datça, Muğla' WHERE description LIKE '%Datça Peninsula%'`);
  await ds.query(`UPDATE races SET title = 'Bayk1 Yarışı', location = 'Bodrum, Muğla' WHERE description LIKE '%Bayk1%'`);
  await ds.query(`UPDATE races SET title = 'Göcek Bahar Regattası', location = 'Göcek, Muğla' WHERE description LIKE '%körfez regattası.%'`);
  console.log("Updated races");
  process.exit(0);
}
main().catch(console.error);
