import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TrackPointsService } from './track-points.service';
import { SyncTrackPointsDto, TrackPointInputDto } from './dto/track-point.dto';
import { Roles } from '../common/decorators';
import { AUTH_COOKIE, TrackPointSourceEnum } from '../common/constants';

@ApiTags('track-points')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('track-points')
export class TrackPointsController {
  private readonly logger = new Logger(TrackPointsController.name);

  constructor(private readonly trackPointsService: TrackPointsService) {}

  /** PWA/HTTP clients cannot claim device provenance or custom device clientKeys. */
  private forcePwaPoints(points: TrackPointInputDto[]): TrackPointInputDto[] {
    return (points || []).map((point) => ({
      ...point,
      source: TrackPointSourceEnum.PWA,
      clientKey: undefined,
      deviceId: undefined,
    }));
  }

  @Post('sync')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Offline GPS buffer batch sync (idempotent)' })
  async sync(@Body() dto: SyncTrackPointsDto) {
    try {
      return await this.trackPointsService.syncBatch(this.forcePwaPoints(dto.points), {
        preferPhoneSource: Boolean(dto.preferPhoneSource),
      });
    } catch (err: any) {
      this.logger.error(
        JSON.stringify({
          event: 'GPS_SYNC_ERROR',
          route: 'POST /track-points/sync',
          batchSize: dto?.points?.length ?? 0,
          error: err?.message || String(err),
        }),
      );
      throw err;
    }
  }

  @Post()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'GPS noktaları batch kaydet (legacy)' })
  async create(@Body() dto: SyncTrackPointsDto) {
    try {
      return await this.trackPointsService.createBatch(this.forcePwaPoints(dto.points), {
        preferPhoneSource: Boolean(dto.preferPhoneSource),
      });
    } catch (err: any) {
      this.logger.error(
        JSON.stringify({
          event: 'GPS_SYNC_ERROR',
          route: 'POST /track-points',
          batchSize: dto?.points?.length ?? 0,
          error: err?.message || String(err),
        }),
      );
      throw err;
    }
  }

  @Get('live')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Son GPS noktaları' })
  async live(@Query('limit') limit?: string) {
    const points = await this.trackPointsService.findLive(limit ? Number(limit) : 50);
    return { points };
  }

  @Get('latest')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiQuery({ name: 'raceId', required: true })
  @ApiOperation({
    summary: 'Yarıştaki her tekne için son GPS noktası (DISTINCT ON — global limit penceresi yok)',
  })
  async latestByRace(@Query('raceId') raceId?: string) {
    if (!raceId) {
      return { points: [] };
    }
    const byBoat = await this.trackPointsService.findLatestByRace(raceId);
    return { points: [...byBoat.values()] };
  }

  @Get()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN')
  @ApiQuery({ name: 'boatId', required: false })
  @ApiQuery({ name: 'raceId', required: false })
  @ApiQuery({ name: 'since', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'GPS noktalarını sorgula' })
  async findAll(
    @Query('boatId') boatId?: string,
    @Query('raceId') raceId?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const points = await this.trackPointsService.findAll({
      boatId,
      raceId,
      since,
      limit: limit ? Number(limit) : undefined,
    });
    return { points };
  }
}
