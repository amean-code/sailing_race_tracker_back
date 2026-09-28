import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { DeviceStatusEnum } from '../../common/constants';
import { Device } from '../../entities/device.entity';
import { extractApiKeyPrefix, verifyDeviceApiKey } from '../device-api-key.util';

export const DEVICE_REQUEST_KEY = 'device';

@Injectable()
export class DeviceApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { [DEVICE_REQUEST_KEY]?: Device }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Device API key required');
    }

    const apiKey = header.slice('Bearer '.length).trim();
    if (!apiKey) {
      throw new UnauthorizedException('Device API key required');
    }

    const prefix = extractApiKeyPrefix(apiKey);
    if (!prefix) {
      throw new UnauthorizedException('Invalid device API key');
    }

    const device = await this.devicesRepo.findOne({ where: { apiKeyPrefix: prefix } });
    if (!device) {
      throw new UnauthorizedException('Invalid device API key');
    }

    const valid = await verifyDeviceApiKey(apiKey, device.apiKeyHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid device API key');
    }

    if (device.status !== DeviceStatusEnum.ACTIVE) {
      throw new UnauthorizedException('Device is disabled');
    }

    req[DEVICE_REQUEST_KEY] = device;
    return true;
  }
}
