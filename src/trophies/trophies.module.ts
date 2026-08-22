import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trophy } from '../entities/trophy.entity';
import { TrophyGroup } from '../entities/trophy-group.entity';
import { Leg } from '../entities/leg.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RaceResult } from '../entities/race-result.entity';
import { TrophiesService } from './trophies.service';
import { TrophiesController } from './trophies.controller';
import { LegsModule } from '../legs/legs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trophy, TrophyGroup, Leg, Race, RaceApplication, RaceResult]),
    forwardRef(() => LegsModule),
  ],
  controllers: [TrophiesController],
  providers: [TrophiesService],
  exports: [TrophiesService],
})
export class TrophiesModule {}
