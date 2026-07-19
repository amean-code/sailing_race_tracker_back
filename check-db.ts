import { AppDataSource } from './src/database/data-source';
import { TrackPoint } from './src/entities';

async function checkDb() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(TrackPoint);
  const count = await repo.count();
  console.log(`Total track points in DB: ${count}`);
  const latest = await repo.find({ order: { recordedAt: 'DESC' }, take: 1 });
  if (latest.length > 0) {
    console.log('Latest point:', latest[0]);
  }
  await AppDataSource.destroy();
}

checkDb().catch(console.error);
