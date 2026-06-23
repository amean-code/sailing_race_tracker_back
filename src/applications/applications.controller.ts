import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Roles } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('applications')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('applications')
export class ApplicationsController {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
  ) {}

  @Get()
  @Roles('COMMITTEE', 'ADMIN')
  @ApiOperation({ summary: 'Tüm yarış başvuruları' })
  async findAll() {
    const applications = await this.applicationsRepo.find({
      relations: ['race'],
      order: { createdAt: 'DESC' },
    });

    return {
      applications: applications.map((app) => ({
        id: app.id,
        raceId: app.raceId,
        raceTitle: app.race?.title ?? '',
        name: app.name,
        email: app.email,
        phone: app.phone,
        boatName: app.boatName,
        sailNumber: app.sailNumber,
        club: app.club,
        notes: app.notes,
        createdAt: app.createdAt.toISOString(),
      })),
    };
  }
}
