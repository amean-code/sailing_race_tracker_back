const { Client } = require('pg');

async function fixNulls() {
  const client = new Client({
    connectionString: 'postgresql://postgres:password@localhost:5432/sailing_race_tracker'
  });
  
  try {
    await client.connect();
    console.log('Connected to database');
    const result = await client.query(`UPDATE race_applications SET name = 'Bilinmeyen' WHERE name IS NULL`);
    console.log(`Updated ${result.rowCount} rows in race_applications (name)`);
    const resultEmail = await client.query(`UPDATE race_applications SET email = 'unknown@example.com' WHERE email IS NULL`);
    console.log(`Updated ${resultEmail.rowCount} rows in race_applications (email)`);
    const resultBoat = await client.query(`UPDATE race_applications SET boat_name = 'Bilinmeyen' WHERE boat_name IS NULL`);
    console.log(`Updated ${resultBoat.rowCount} rows in race_applications (boat_name)`);
    const resultSail = await client.query(`UPDATE race_applications SET sail_number = 'Bilinmeyen' WHERE sail_number IS NULL`);
    console.log(`Updated ${resultSail.rowCount} rows in race_applications (sail_number)`);
    console.log('Done');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixNulls();
