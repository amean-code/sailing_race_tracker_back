import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalFlagCatalogEntity } from '../entities/signal-flag-catalog.entity';
import { SignalFlagsController } from './signal-flags.controller';
import { SignalFlagsService } from './signal-flags.service';

@Module({
  imports: [TypeOrmModule.forFeature([SignalFlagCatalogEntity])],
  controllers: [SignalFlagsController],
  providers: [SignalFlagsService],
  exports: [SignalFlagsService],
})
export class SignalFlagsModule {}
