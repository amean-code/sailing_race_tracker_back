import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Boat } from '../entities/boat.entity';
import { DeviceAssignment } from '../entities/device-assignment.entity';
import { Device } from '../entities/device.entity';
import { TrackPointsModule } from '../track-points/track-points.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceApiKeyGuard } from './guards/device-api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Boat, DeviceAssignment]),
    TrackPointsModule,
  ],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceApiKeyGuard],
  exports: [DevicesService],
})
export class DevicesModule {}
