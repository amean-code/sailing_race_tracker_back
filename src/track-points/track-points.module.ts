import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../entities/device.entity';
import { DeviceLiveEmitWatermark } from '../entities/device-live-emit-watermark.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { TrackPointsService } from './track-points.service';
import { TrackPointsController } from './track-points.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TrackPoint, Device, DeviceLiveEmitWatermark])],
  controllers: [TrackPointsController],
  providers: [TrackPointsService],
  exports: [TrackPointsService],
})
export class TrackPointsModule {}
