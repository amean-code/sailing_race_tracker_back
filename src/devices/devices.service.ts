import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceStatusEnum } from '../common/constants';
import { Boat } from '../entities/boat.entity';
import { Device } from '../entities/device.entity';
import { TrackPointsService } from '../track-points/track-points.service';
import { generateDeviceApiKey } from './device-api-key.util';
import { parseDeviceTimestamp } from './device-location.util';
import {
  AssignDeviceDto,
  CreateDeviceDto,
  DeviceLocationDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    private readonly trackPointsService: TrackPointsService,
  ) {}

  serialize(device: Device) {
    return {
      id: device.id,
      name: device.name,
      hardwareId: device.hardwareId,
      apiKeyPrefix: device.apiKeyPrefix,
      status: device.status,
      assignedBoatId: device.assignedBoatId,
      lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
      lastLat: device.lastLat,
      lastLng: device.lastLng,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateDeviceDto) {
    const existing = await this.devicesRepo.findOne({
      where: { hardwareId: dto.hardwareId },
    });
    if (existing) {
      throw new ConflictException('A device with this hardwareId already exists');
    }

    const { apiKey, apiKeyPrefix, apiKeyHash } = await generateDeviceApiKey();
    const entity = this.devicesRepo.create({
      name: dto.name,
      hardwareId: dto.hardwareId,
      apiKeyPrefix,
      apiKeyHash,
      status: DeviceStatusEnum.ACTIVE,
      assignedBoatId: null,
    });
    const saved = await this.devicesRepo.save(entity);
    return { device: this.serialize(saved), apiKey };
  }

  async findAll() {
    const devices = await this.devicesRepo.find({
      order: { createdAt: 'DESC' },
    });
    return devices.map((d) => this.serialize(d));
  }

  async findOne(id: string) {
    const device = await this.devicesRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.serialize(device);
  }

  private async getEntityOrFail(id: string): Promise<Device> {
    const device = await this.devicesRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto) {
    const device = await this.getEntityOrFail(id);
    if (dto.name != null) device.name = dto.name;
    if (dto.status != null) device.status = dto.status;
    const saved = await this.devicesRepo.save(device);
    return this.serialize(saved);
  }

  async assign(id: string, dto: AssignDeviceDto) {
    const device = await this.getEntityOrFail(id);
    const boat = await this.boatsRepo.findOne({ where: { id: dto.boatId } });
    if (!boat) throw new NotFoundException('Boat not found');
    device.assignedBoatId = boat.id;
    const saved = await this.devicesRepo.save(device);
    return this.serialize(saved);
  }

  async unassign(id: string) {
    const device = await this.getEntityOrFail(id);
    device.assignedBoatId = null;
    const saved = await this.devicesRepo.save(device);
    return this.serialize(saved);
  }

  async rotateKey(id: string) {
    const device = await this.getEntityOrFail(id);
    const { apiKey, apiKeyPrefix, apiKeyHash } = await generateDeviceApiKey();
    device.apiKeyPrefix = apiKeyPrefix;
    device.apiKeyHash = apiKeyHash;
    const saved = await this.devicesRepo.save(device);
    return { device: this.serialize(saved), apiKey };
  }

  async ingestLocation(device: Device, dto: DeviceLocationDto) {
    if (device.status !== DeviceStatusEnum.ACTIVE) {
      throw new UnprocessableEntityException('Device is disabled');
    }
    if (!device.assignedBoatId) {
      throw new UnprocessableEntityException('Device is not assigned to a boat');
    }

    const boat = await this.boatsRepo.findOne({ where: { id: device.assignedBoatId } });
    if (!boat) {
      throw new UnprocessableEntityException('Assigned boat not found');
    }
    if (!boat.raceId) {
      throw new UnprocessableEntityException('Assigned boat is not linked to a race');
    }

    const parsed = parseDeviceTimestamp(dto.timestamp);
    if (!parsed.ok) {
      throw new BadRequestException(
        parsed.reason === 'timestamp_too_far_in_future'
          ? 'timestamp must not be more than 5 minutes in the future'
          : 'Invalid timestamp',
      );
    }

    if (dto.heading != null && (dto.heading < 0 || dto.heading >= 360)) {
      throw new BadRequestException('heading must be >= 0 and < 360');
    }

    const syncResult = await this.trackPointsService.syncBatch([
      {
        boatId: boat.id,
        raceId: boat.raceId,
        courseId: boat.courseId ?? null,
        lat: dto.latitude,
        lng: dto.longitude,
        speed: dto.speed ?? null,
        heading: dto.heading ?? null,
        accuracy: dto.accuracy ?? null,
        timestamp: parsed.timestampMs,
      },
    ]);

    device.lastSeenAt = new Date();
    device.lastLat = dto.latitude;
    device.lastLng = dto.longitude;
    await this.devicesRepo.save(device);

    return {
      accepted: syncResult.success,
      inserted: syncResult.inserted,
      skipped: syncResult.skipped,
      failed: syncResult.failed,
      boatId: boat.id,
      raceId: boat.raceId,
      device: this.serialize(device),
    };
  }
}
