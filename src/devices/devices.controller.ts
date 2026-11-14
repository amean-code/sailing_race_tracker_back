import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AUTH_COOKIE } from '../common/constants';
import { CurrentUser, Public, Roles, SessionUser } from '../common/decorators';
import { Device } from '../entities/device.entity';
import {
  AssignDeviceDto,
  CreateDeviceDto,
  DeviceLocationDto,
  UnassignDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';
import { DevicesService } from './devices.service';
import { DEVICE_REQUEST_KEY, DeviceApiKeyGuard } from './guards/device-api-key.guard';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('locations')
  @Public()
  @UseGuards(DeviceApiKeyGuard)
  @ApiBearerAuth('device-api-key')
  @ApiOperation({
    summary: 'IoT GPS location ingest (Device API Key)',
    description:
      'Authenticated via Authorization: Bearer <deviceApiKey>. ' +
      'Resolves Boat/Race from device assignment. Reuses TrackPointsService.syncBatch. ' +
      'accuracy must be metres — do not send HDOP.',
  })
  async ingestLocation(
    @Req() req: Request & { [DEVICE_REQUEST_KEY]?: Device },
    @Body() dto: DeviceLocationDto,
  ) {
    const device = req[DEVICE_REQUEST_KEY]!;
    return this.devicesService.ingestLocation(device, dto);
  }

  @Post()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Create IoT GPS device (returns API key once)' })
  async create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Get()
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'List IoT GPS devices' })
  async findAll() {
    const devices = await this.devicesService.findAll();
    return { devices };
  }

  @Get('assignments')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'List device assignment history' })
  async listAssignments(@Query('deviceId') deviceId?: string) {
    const assignments = await this.devicesService.listAssignments(deviceId);
    return { assignments };
  }

  @Get(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Get IoT GPS device detail' })
  async findOne(@Param('id') id: string) {
    const device = await this.devicesService.findOne(id);
    return { device };
  }

  @Patch(':id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Update device name/status (enable/disable)' })
  async update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    const device = await this.devicesService.update(id, dto);
    return { device };
  }

  @Post(':id/assign')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({
    summary: 'Assign device to a boat (one active device per boat; history recorded)',
  })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignDeviceDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.devicesService.assign(id, dto, user?.sub ?? null);
  }

  @Post(':id/unassign')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Unassign device from its boat (history recorded)' })
  async unassign(
    @Param('id') id: string,
    @Body() dto: UnassignDeviceDto,
    @CurrentUser() user: SessionUser,
  ) {
    const device = await this.devicesService.unassign(id, dto || {}, user?.sub ?? null);
    return { device };
  }

  @Post(':id/rotate-key')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Rotate device API key (returns new key once)' })
  async rotateKey(@Param('id') id: string) {
    return this.devicesService.rotateKey(id);
  }
}
