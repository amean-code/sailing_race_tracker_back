import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:password@localhost:5432/sailing_race_tracker',
});

async function main() {
  await ds.initialize();
  console.log('Database connected successfully.');

  // Find all sailor users
  const sailors = await ds.query("SELECT * FROM users WHERE role = 'SAILOR'");
  console.log(`Found ${sailors.length} sailors.`);

  const courseId = 'bb985ec8-43ca-4ba4-94f9-1bb34084b4c3';

  // 1. Seed COMPLETED race
  const completedRaceId = uuidv4();
  await ds.query(`
    INSERT INTO races (
      id, title, description, location, venue, start_date, end_date, 
      registration_deadline, boat_class, capacity, status, organizer, 
      course_id, race_state, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
    )
  `, [
    completedRaceId,
    '🏆 Bodrum Zafer Kupası',
    'Harika hava koşulları altında tamamlanan, yüksek taktik mücadelelere sahne olmuş sezonun prestijli yarışı.',
    'Bodrum, Muğla',
    'Bodrum Yelken Kulübü',
    new Date('2026-07-10T10:00:00Z'),
    new Date('2026-07-10T16:00:00Z'),
    new Date('2026-07-09T18:00:00Z'),
    'IRC 1',
    30,
    'FINISHED',
    'Themis',
    courseId,
    JSON.stringify({ startedAt: '2026-07-10T10:05:00.000Z' }),
  ]);
  console.log(`Seeded Completed Race: ${completedRaceId}`);

  // 2. Seed LIVE/STARTABLE race
  const liveRaceId = uuidv4();
  await ds.query(`
    INSERT INTO races (
      id, title, description, location, venue, start_date, end_date, 
      registration_deadline, boat_class, capacity, status, organizer, 
      course_id, race_state, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
    )
  `, [
    liveRaceId,
    '⛵ Canlı Test Yarışı',
    'Şu an panelden başlatıp, haritada dev geri sayımı izleyebileceğiniz ve finişi geçtiğinizde sonuçlarını göreceğiniz canlı test yarışı.',
    'Bodrum, Muğla',
    'Bodrum Yelken Kulübü',
    new Date('2026-07-13T14:00:00Z'),
    new Date('2026-07-13T22:00:00Z'),
    new Date('2026-07-13T13:00:00Z'),
    'IRC 1',
    30,
    'OPEN',
    'Themis',
    courseId,
    JSON.stringify({}),
  ]);
  console.log(`Seeded Live Race: ${liveRaceId}`);

  // Loop through all sailors and add applications & passes
  for (const sailor of sailors) {
    const boatName = `${sailor.name}'in Teknesi`;
    const sailNumber = `TUR-${Math.floor(1000 + Math.random() * 9000)}`;

    // A. Seed Completed Race Application
    const completedAppId = uuidv4();
    await ds.query(`
      INSERT INTO race_applications (
        id, race_id, name, email, boat_name, sail_number, status, 
        user_id, checked_in_at, finish_position, fleet_size, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      )
    `, [
      completedAppId,
      completedRaceId,
      sailor.name,
      sailor.email,
      boatName,
      sailNumber,
      'APPROVED',
      sailor.id,
      new Date('2026-07-10T09:30:00Z'),
      2, // Finish position
      5, // Fleet size
    ]);

    // Seed passes for Completed Race
    const startBase = new Date('2026-07-10T10:05:00Z').getTime();
    const checkpoints = [
      { id: 'S', index: 0, delay: 0 },
      { id: 'B1', index: 1, delay: 1250 },
      { id: 'G1', index: 2, delay: 2840 },
      { id: 'B2', index: 3, delay: 4120 },
      { id: 'F', index: 4, delay: 5320 },
    ];

    for (const cp of checkpoints) {
      await ds.query(`
        INSERT INTO checkpoint_passes (
          id, race_id, application_id, checkpoint_index, checkpoint_id, 
          passed_at, elapsed_seconds, rank, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        )
      `, [
        uuidv4(),
        completedRaceId,
        completedAppId,
        cp.index,
        cp.id,
        new Date(startBase + cp.delay * 1000),
        cp.delay,
        2, // Rank at checkpoint
      ]);
    }

    // B. Seed Live Race Application
    const liveAppId = uuidv4();
    await ds.query(`
      INSERT INTO race_applications (
        id, race_id, name, email, boat_name, sail_number, status, 
        user_id, checked_in_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
    `, [
      liveAppId,
      liveRaceId,
      sailor.name,
      sailor.email,
      boatName,
      sailNumber,
      'APPROVED',
      sailor.id,
    ]);
  }

  console.log('Seeding completed successfully for all sailors.');
  process.exit(0);
}
main().catch(console.error);
