import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { ApplicationStatusEnum } from '../constants';
import { RaceApplication } from '../../entities/race-application.entity';
import { Boat } from '../../entities/boat.entity';

/** Applications that still occupy a registration slot. Withdrawn rows do not. */
export function countedApplicationWhere(legId: string): FindOptionsWhere<RaceApplication> {
  return {
    legId,
    status: Not(ApplicationStatusEnum.WITHDRAWN),
  };
}

/** Drop the race link created when an application was approved. */
export async function releaseBoatBoundToApplication(
  boatsRepo: Repository<Boat>,
  app: Pick<RaceApplication, 'id' | 'boatId'>,
  boat?: Boat | null,
) {
  const target = boat ?? (app.boatId
    ? await boatsRepo.findOne({ where: { id: app.boatId } })
    : null);
  if (!target) return;
  if (target.applicationId && target.applicationId !== app.id) return;

  target.applicationId = null;
  target.raceId = null;
  target.courseId = null;
  if (target.status === 'registered') target.status = 'idle';
  await boatsRepo.save(target);
}
