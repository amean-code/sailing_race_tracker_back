import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoTestController } from './demo-test.controller';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { Boat } from '../entities/boat.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { User } from '../entities/user.entity';
import { TrackPointsModule } from '../track-points/track-points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Race,
      Course,
      Boat,
      RaceApplication,
      TrackPoint,
      AuditLog,
      CheckpointPass,
      User
    ]),
    TrackPointsModule,
  ],
  controllers: [DemoTestController],
})
export class DemoTestModule {}
