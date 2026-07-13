import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:password@localhost:5432/sailing_race_tracker',
});

async function main() {
  await ds.initialize();
  const res = await ds.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'races';
  `);
  console.log(res);
  process.exit(0);
}
main().catch(console.error);
