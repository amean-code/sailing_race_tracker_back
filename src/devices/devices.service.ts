import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeviceAssignmentStatusEnum,
  DeviceStatusEnum,
  TrackPointSourceEnum,
} from '../common/constants';
import { Boat } from '../entities/boat.entity';
import { DeviceAssignment } from '../entities/device-assignment.entity';
import { Device } from '../entities/device.entity';
import { TrackPointsService } from '../track-points/track-points.service';
import { generateDeviceApiKey } from './device-api-key.util';
import { parseDeviceTimestamp } from './device-location.util';
import {
  AssignDeviceDto,
  CreateDeviceDto,
  DeviceLocationDto,
  UnassignDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devicesRepo: Repository<Device>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    @InjectRepository(DeviceAssignment)
    private readonly assignmentsRepo: Repository<DeviceAssignment>,
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

  serializeAssignment(row: DeviceAssignment) {
    return {
      id: row.id,
      deviceId: row.deviceId,
      boatId: row.boatId,
      raceId: row.raceId,
      assignmentStatus: row.assignmentStatus,
      assignedAt: row.assignedAt.toISOString(),
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      assignedBy: row.assignedBy,
      releasedBy: row.releasedBy,
      replacementReason: row.replacementReason,
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

  private async releaseActiveAssignmentsForDevice(
    deviceId: string,
    releasedBy: string | null,
    status: DeviceAssignmentStatusEnum,
    reason: string | null,
  ) {
    const active = await this.assignmentsRepo.find({
      where: {
        deviceId,
        assignmentStatus: DeviceAssignmentStatusEnum.ACTIVE,
      },
    });
    const now = new Date();
    for (const row of active) {
      row.assignmentStatus = status;
      row.releasedAt = now;
      row.releasedBy = releasedBy;
      row.replacementReason = reason;
      await this.assignmentsRepo.save(row);
    }
  }

  private async releaseActiveAssignmentsForBoat(
    boatId: string,
    releasedBy: string | null,
    status: DeviceAssignmentStatusEnum,
    reason: string | null,
    exceptDeviceId?: string,
  ) {
    const active = await this.assignmentsRepo.find({
      where: {
        boatId,
        assignmentStatus: DeviceAssignmentStatusEnum.ACTIVE,
      },
    });
    const now = new Date();
    for (const row of active) {
      if (exceptDeviceId && row.deviceId === exceptDeviceId) continue;
      row.assignmentStatus = status;
      row.releasedAt = now;
      row.releasedBy = releasedBy;
      row.replacementReason = reason;
      await this.assignmentsRepo.save(row);

      const other = await this.devicesRepo.findOne({ where: { id: row.deviceId } });
      if (other && other.assignedBoatId === boatId) {
        other.assignedBoatId = null;
        await this.devicesRepo.save(other);
      }
    }
  }

  /**
   * Enforces: one active assignment per device, one active device per boat.
   * Keeps Device.assignedBoatId as the live snapshot for ingest.
   */
  async assign(id: string, dto: AssignDeviceDto, assignedBy: string | null = null) {
    const device = await this.getEntityOrFail(id);
    const boat = await this.boatsRepo.findOne({ where: { id: dto.boatId } });
    if (!boat) throw new NotFoundException('Boat not found');

    if (device.assignedBoatId === boat.id) {
      const existing = await this.assignmentsRepo.findOne({
        where: {
          deviceId: device.id,
          boatId: boat.id,
          assignmentStatus: DeviceAssignmentStatusEnum.ACTIVE,
        },
      });
      if (existing) {
        return {
          device: this.serialize(device),
          assignment: this.serializeAssignment(existing),
        };
      }
    }

    const reason =
      dto.replacementReason?.trim() ||
      (device.assignedBoatId && device.assignedBoatId !== boat.id
        ? 'reassigned_to_another_boat'
        : 'boat_device_replaced');

    await this.releaseActiveAssignmentsForDevice(
      device.id,
      assignedBy,
      DeviceAssignmentStatusEnum.REPLACED,
      reason,
    );
    await this.releaseActiveAssignmentsForBoat(
      boat.id,
      assignedBy,
      DeviceAssignmentStatusEnum.REPLACED,
      reason,
      device.id,
    );

    device.assignedBoatId = boat.id;
    const saved = await this.devicesRepo.save(device);

    const assignment = this.assignmentsRepo.create({
      deviceId: saved.id,
      boatId: boat.id,
      raceId: boat.raceId ?? null,
      assignmentStatus: DeviceAssignmentStatusEnum.ACTIVE,
      assignedBy,
      releasedAt: null,
      releasedBy: null,
      replacementReason: null,
    });
    const savedAssignment = await this.assignmentsRepo.save(assignment);

    return {
      device: this.serialize(saved),
      assignment: this.serializeAssignment(savedAssignment),
    };
  }

  async unassign(id: string, dto: UnassignDeviceDto = {}, releasedBy: string | null = null) {
    const device = await this.getEntityOrFail(id);
    const reason = dto.replacementReason?.trim() || 'unassigned';

    await this.releaseActiveAssignmentsForDevice(
      device.id,
      releasedBy,
      DeviceAssignmentStatusEnum.RELEASED,
      reason,
    );

    device.assignedBoatId = null;
    const saved = await this.devicesRepo.save(device);
    return this.serialize(saved);
  }

  async listAssignments(deviceId?: string) {
    const where = deviceId ? { deviceId } : {};
    const rows = await this.assignmentsRepo.find({
      where,
      order: { assignedAt: 'DESC' },
      take: 500,
    });
    return rows.map((r) => this.serializeAssignment(r));
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

    const boat = await this.boatsRepo.findOne({
      where: { id: device.assignedBoatId },
      relations: ['race'],
    });
    if (!boat) {
      throw new UnprocessableEntityException('Assigned boat not found');
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

    // No race yet (pre-approval): still accept the fix for admin device map /
    // health, but do not write race-scoped track points or emit live fleet GPS.
    if (!boat.raceId) {
      device.lastSeenAt = new Date();
      device.lastLat = dto.latitude;
      device.lastLng = dto.longitude;
      await this.devicesRepo.save(device);
      return {
        accepted: true,
        inserted: 0,
        skipped: 0,
        failed: 0,
        boatId: boat.id,
        raceId: null,
        device: this.serialize(device),
      };
    }

    // Keep track points aligned with the race course when boat.courseId was left null
    // (e.g. course assigned to the race after application approval).
    const courseId = boat.courseId ?? boat.race?.courseId ?? null;
    if (!boat.courseId && courseId) {
      boat.courseId = courseId;
      await this.boatsRepo.save(boat);
    }

    const syncResult = await this.trackPointsService.syncBatch([
      {
        boatId: boat.id,
        raceId: boat.raceId,
        courseId,
        lat: dto.latitude,
        lng: dto.longitude,
        speed: dto.speed ?? null,
        heading: dto.heading ?? null,
        accuracy: dto.accuracy ?? null,
        timestamp: parsed.timestampMs,
        source: TrackPointSourceEnum.DEVICE,
        deviceId: device.id,
        clientKey: `device:${device.id}:${parsed.timestampMs}`,
      },
    ]);

    // Only advance the device heartbeat when a row was persisted or idempotently
    // skipped — otherwise admin lastLat lies about race-fleet GPS availability.
    if (!syncResult.success) {
      throw new UnprocessableEntityException(
        'Device location was not stored as a track point',
      );
    }

    device.lastSeenAt = new Date();
    device.lastLat = dto.latitude;
    device.lastLng = dto.longitude;
    await this.devicesRepo.save(device);

    return {
      accepted: true,
      inserted: syncResult.inserted,
      skipped: syncResult.skipped,
      failed: syncResult.failed,
      boatId: boat.id,
      raceId: boat.raceId,
      device: this.serialize(device),
    };
  }
}
