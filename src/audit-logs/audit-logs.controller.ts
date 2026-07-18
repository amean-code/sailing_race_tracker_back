import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { Roles } from '../common/decorators';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMMITTEE')
  async getLogs(
    @Query('raceId') raceId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.auditLogsService.getLogs(raceId, limit, offset);
  }
}
