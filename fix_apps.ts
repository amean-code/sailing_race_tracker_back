import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:password@localhost:5432/sailing_race_tracker',
});

async function main() {
  await ds.initialize();
  const res = await ds.query(`
    UPDATE race_applications 
    SET name = 'Demo Yarışçı', 
        email = 'demo@bayk.test', 
        boat_name = 'Rüzgar', 
        sail_number = 'TUR 42' 
    WHERE name = '' OR name IS NULL
  `);
  console.log("Updated applications:", res);
  process.exit(0);
}
main().catch(console.error);
