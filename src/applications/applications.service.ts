import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createReadStream, existsSync } from 'fs';
import { RaceApplication } from '../entities/race-application.entity';
import { Boat } from '../entities/boat.entity';
import { Race } from '../entities/race.entity';
import { TrophyGroup } from '../entities/trophy-group.entity';
import { ApplicationStatusEnum, PaymentStatusEnum, UserRoleEnum } from '../common/constants';
import { SessionUser } from '../common/decorators';
import { BulkUpdateApplicationDto, ReviewPaymentDto, UpdateApplicationDto } from './dto/application.dto';
import {
  absoluteUploadPath,
  deleteUploadFile,
  relativeUploadPath,
  RECEIPTS_DIR,
} from '../common/upload';

import { EventEmitter2 } from '@nestjs/event-emitter';

const APP_STATUSES = new Set<string>([
  ApplicationStatusEnum.PENDING,
  ApplicationStatusEnum.APPROVED,
  ApplicationStatusEnum.CHECKED_IN,
  ApplicationStatusEnum.WITHDRAWN,
]);

const COUNTED_GROUP_STATUSES = [
  ApplicationStatusEnum.APPROVED,
  ApplicationStatusEnum.CHECKED_IN,
];

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    @InjectRepository(TrophyGroup)
    private readonly groupsRepo: Repository<TrophyGroup>,
    private eventEmitter: EventEmitter2,
  ) {}

  serialize(app: RaceApplication) {
    return {
      id: app.id,
      legId: app.legId,
      trophyId: app.leg?.trophyId ?? null,
      raceTitle: app.leg?.title ?? '',
      name: app.name,
      email: app.email,
      phone: app.phone,
      boatName: app.boatName,
      sailNumber: app.sailNumber,
      club: app.club,
      notes: app.notes,
      status: app.status,
      boatId: app.boatId,
      groupId: app.groupId ?? null,
      groupName: app.group?.name ?? null,
      temporaryGroupAssignment: Boolean(app.temporaryGroupAssignment),
      userId: app.userId,
      checkedInAt: app.checkedInAt?.toISOString() ?? null,
      finishPosition: null as number | null,
      fleetSize: null as number | null,
      crewMembers: app.crewMembers,
      paymentStatus: app.paymentStatus ?? PaymentStatusEnum.NONE,
      paymentReceiptFileName: app.paymentReceiptFileName,
      paymentReceiptUrl: app.paymentReceiptPath
        ? `/api/applications/${app.id}/payment-receipt`
        : null,
      paymentNote: app.paymentNote,
      paymentReviewedAt: app.paymentReviewedAt?.toISOString() ?? null,
      createdAt: app.createdAt.toISOString(),
    };
  }

  private async resolveLegId(legId?: string, raceId?: string): Promise<string | undefined> {
    if (legId) return legId;
    if (!raceId) return undefined;
    const race = await this.racesRepo.findOne({
      where: { id: raceId },
      select: ['id', 'legId'],
    });
    if (!race?.legId) {
      throw new NotFoundException('Yarış veya bağlı ayak bulunamadı');
    }
    return race.legId;
  }

  private async firstRaceForLeg(legId: string | null | undefined): Promise<Race | null> {
    if (!legId) return null;
    return this.racesRepo.findOne({
      where: { legId },
      order: { raceOrder: 'ASC', startDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async findAll(user?: SessionUser, options?: { legId?: string; raceId?: string }) {
    const qb = this.applicationsRepo.createQueryBuilder('app')
      .leftJoinAndSelect('app.leg', 'leg')
      .leftJoinAndSelect('app.group', 'grp')
      .orderBy('app.createdAt', 'DESC');

    const resolvedLegId = await this.resolveLegId(options?.legId, options?.raceId);
    if (resolvedLegId) {
      qb.andWhere('app.legId = :legId', { legId: resolvedLegId });
    }

    if (user?.role === UserRoleEnum.COMMITTEE) {
      qb.andWhere('leg.assignedCommitteeId = :userId', { userId: user.sub });
    } else if (user?.role === UserRoleEnum.ADMIN) {
      qb.andWhere('leg.createdById = :userId', { userId: user.sub });
    }

    const applications = await qb.getMany();
    return applications.map((app) => this.serialize(app));
  }

  private pickColor(index: number): string {
    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#10b981',
      '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
    ];
    return colors[index % colors.length];
  }

  private normalizeAppStatus(status: ApplicationStatusEnum | string): ApplicationStatusEnum {
    if (APP_STATUSES.has(status)) return status as ApplicationStatusEnum;
    // DNS/DNF/DSQ live on RaceResult now — keep application as APPROVED
    if (
      status === ApplicationStatusEnum.DNS ||
      status === ApplicationStatusEnum.DNF ||
      status === ApplicationStatusEnum.DSQ
    ) {
      return ApplicationStatusEnum.APPROVED;
    }
    throw new BadRequestException('Geçersiz başvuru durumu');
  }

  private async ensureBoatForApproval(app: RaceApplication, user?: SessionUser) {
    let boat = await this.boatsRepo.findOne({ where: { applicationId: app.id } });
    if (boat) return boat;

    const race = await this.firstRaceForLeg(app.legId);
    if (!race) {
      throw new BadRequestException('Bu ayak altında tekne oluşturmak için en az bir yarış gerekli');
    }

    const existingCount = await this.boatsRepo.count({
      where: { raceId: race.id, status: 'registered' },
    });

    boat = this.boatsRepo.create({
      name: app.boatName,
      sailNumber: app.sailNumber,
      competitorName: app.name,
      applicationId: app.id,
      raceId: race.id,
      courseId: race.courseId ?? null,
      status: 'registered',
      displayColor: this.pickColor(existingCount),
      crewMembers: app.crewMembers ?? null,
    });
    await this.boatsRepo.save(boat);
    app.boatId = boat.id;
    app.checkedInAt = new Date();
    this.eventEmitter.emit('boat.checked_in', {
      raceId: race.id,
      boatId: boat.id,
      userId: user?.sub,
    });
    return boat;
  }

  private async countGroupMembers(
    groupId: string,
    excludeAppIds: string[] = [],
  ): Promise<number> {
    const qb = this.applicationsRepo
      .createQueryBuilder('app')
      .where('app.groupId = :groupId', { groupId })
      .andWhere('app.status IN (:...statuses)', { statuses: COUNTED_GROUP_STATUSES });
    if (excludeAppIds.length > 0) {
      qb.andWhere('app.id NOT IN (:...excludeAppIds)', { excludeAppIds });
    }
    return qb.getCount();
  }

  /**
   * Assign group on trophy-leg approval. Soft capacity: over-capacity requires temporary flag.
   */
  private async assignGroupForApproval(
    app: RaceApplication,
    opts: {
      groupId?: string | null;
      temporaryGroupAssignment?: boolean;
      /** Extra seats already reserved in this bulk batch for the same group */
      pendingBatchCount?: number;
    },
  ) {
    const trophyId = app.leg?.trophyId ?? null;
    if (!trophyId) {
      app.groupId = null;
      app.group = null;
      app.temporaryGroupAssignment = false;
      return;
    }

    const groupId = opts.groupId?.trim() || app.groupId;
    if (!groupId) {
      throw new BadRequestException(
        'Trofe başvurusunu onaylamak için bir grup seçilmelidir.',
      );
    }

    const group = await this.groupsRepo.findOne({
      where: { id: groupId, trophyId },
    });
    if (!group) {
      throw new BadRequestException('Seçilen grup bu trofeye ait değil.');
    }

    const memberCount = await this.countGroupMembers(groupId, [app.id]);
    const projected = memberCount + 1 + (opts.pendingBatchCount ?? 0);
    const isOverCapacity =
      group.capacity != null && projected > group.capacity;

    if (isOverCapacity && !opts.temporaryGroupAssignment) {
      throw new BadRequestException(
        'Kapasite dolu; geçici atama onaylayın veya başka grup seçin.',
      );
    }

    app.groupId = group.id;
    app.group = group;
    app.temporaryGroupAssignment = Boolean(isOverCapacity && opts.temporaryGroupAssignment);
  }

  async update(id: string, dto: UpdateApplicationDto, user?: SessionUser) {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['leg', 'group'],
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');

    if (
      user?.role === UserRoleEnum.COMMITTEE &&
      app.leg?.assignedCommitteeId !== user.sub
    ) {
      throw new ForbiddenException('Bu yarış size atanmamış.');
    }
    if (user?.role === UserRoleEnum.ADMIN && app.leg?.createdById !== user.sub) {
      throw new ForbiddenException('Bu yarış size ait değil.');
    }

    if (dto.status !== undefined) {
      if (app.status === ApplicationStatusEnum.APPROVED && dto.status === ApplicationStatusEnum.APPROVED) {
        // Already approved, no-op for boat creation
      }
      const nextStatus = this.normalizeAppStatus(dto.status);
      app.status = nextStatus;

      if (nextStatus === ApplicationStatusEnum.APPROVED) {
        await this.assignGroupForApproval(app, {
          groupId: dto.groupId,
          temporaryGroupAssignment: dto.temporaryGroupAssignment,
        });
        await this.ensureBoatForApproval(app, user);
      }
    } else if (dto.groupId !== undefined) {
      // Reassign group without status change (approved apps)
      if (
        app.status === ApplicationStatusEnum.APPROVED ||
        app.status === ApplicationStatusEnum.CHECKED_IN
      ) {
        await this.assignGroupForApproval(app, {
          groupId: dto.groupId,
          temporaryGroupAssignment: dto.temporaryGroupAssignment,
        });
      }
    }

    if (dto.notes !== undefined) app.notes = dto.notes;

    const saved = await this.applicationsRepo.save(app);
    saved.leg = app.leg;
    saved.group = app.group;
    return this.serialize(saved);
  }

  async bulkUpdate(dto: BulkUpdateApplicationDto, user?: SessionUser) {
    if (!dto.ids || dto.ids.length === 0) {
      throw new BadRequestException('En az bir başvuru seçilmelidir');
    }

    const apps = await this.applicationsRepo.find({
      where: { id: In(dto.ids) },
      relations: ['leg', 'group'],
    });

    if (apps.length === 0) throw new NotFoundException('Başvurular bulunamadı');

    const results: ReturnType<typeof this.serialize>[] = [];
    const nextStatus = this.normalizeAppStatus(dto.status);

    let pendingInGroup = 0;

    for (const app of apps) {
      if (
        user?.role === UserRoleEnum.COMMITTEE &&
        app.leg?.assignedCommitteeId !== user.sub
      ) {
        throw new ForbiddenException('Bu yarış size atanmamış.');
      }
      if (user?.role === UserRoleEnum.ADMIN && app.leg?.createdById !== user.sub) {
        throw new ForbiddenException('Bu yarış size ait değil.');
      }

      app.status = nextStatus;

      if (nextStatus === ApplicationStatusEnum.APPROVED) {
        await this.assignGroupForApproval(app, {
          groupId: dto.groupId,
          temporaryGroupAssignment: dto.temporaryGroupAssignment,
          pendingBatchCount: app.leg?.trophyId ? pendingInGroup : 0,
        });
        if (app.leg?.trophyId) pendingInGroup += 1;
        await this.ensureBoatForApproval(app, user);
      }

      const saved = await this.applicationsRepo.save(app);
      saved.leg = app.leg;
      saved.group = app.group;
      results.push(this.serialize(saved));
    }

    return results;
  }

  private async getAppWithLeg(id: string) {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['leg', 'group'],
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');
    return app;
  }

  private assertSailorOwns(app: RaceApplication, user: SessionUser) {
    const email = user.email?.toLowerCase();
    if (app.userId === user.sub) return;
    if (email && app.email?.toLowerCase() === email) return;
    throw new ForbiddenException('Bu başvuru size ait değil');
  }

  private assertCanManageApp(app: RaceApplication, user: SessionUser) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) return;
    if (user.role === UserRoleEnum.ADMIN) {
      if (app.leg?.createdById !== user.sub) {
        throw new ForbiddenException('Bu yarış size ait değil.');
      }
      return;
    }
    if (
      user.role === UserRoleEnum.COMMITTEE &&
      app.leg?.assignedCommitteeId === user.sub
    ) {
      return;
    }
    throw new ForbiddenException('Bu başvuruyu yönetme yetkiniz yok');
  }

  async uploadPaymentReceipt(id: string, user: SessionUser, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Dekont dosyası gerekli');
    const app = await this.getAppWithLeg(id);
    this.assertSailorOwns(app, user);

    deleteUploadFile(app.paymentReceiptPath);
    app.paymentReceiptPath = relativeUploadPath(RECEIPTS_DIR, file.filename);
    app.paymentReceiptFileName = file.originalname;
    app.paymentStatus = PaymentStatusEnum.PENDING;
    app.paymentNote = null;
    app.paymentReviewedAt = null;
    if (!app.userId) app.userId = user.sub;

    const saved = await this.applicationsRepo.save(app);
    saved.leg = app.leg;
    saved.group = app.group;
    return this.serialize(saved);
  }

  async reviewPayment(id: string, dto: ReviewPaymentDto, user: SessionUser) {
    const app = await this.getAppWithLeg(id);
    this.assertCanManageApp(app, user);

    if (!app.paymentReceiptPath && dto.status === PaymentStatusEnum.APPROVED) {
      throw new BadRequestException('Dekont yüklenmeden ödeme onaylanamaz');
    }

    app.paymentStatus = dto.status;
    app.paymentNote = dto.note?.trim() || null;
    app.paymentReviewedAt = new Date();

    const saved = await this.applicationsRepo.save(app);
    saved.leg = app.leg;
    saved.group = app.group;
    return this.serialize(saved);
  }

  async getPaymentReceiptFile(id: string, user: SessionUser): Promise<{
    file: StreamableFile;
    fileName: string;
  }> {
    const app = await this.getAppWithLeg(id);

    const isOwner =
      app.userId === user.sub ||
      (user.email && app.email?.toLowerCase() === user.email.toLowerCase());
    const isStaff =
      user.role === UserRoleEnum.SUPER_ADMIN ||
      (user.role === UserRoleEnum.ADMIN && app.leg?.createdById === user.sub) ||
      (user.role === UserRoleEnum.COMMITTEE && app.leg?.assignedCommitteeId === user.sub);

    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Bu dekonta erişim yok');
    }
    if (!app.paymentReceiptPath) throw new NotFoundException('Dekont bulunamadı');

    const full = absoluteUploadPath(app.paymentReceiptPath);
    if (!existsSync(full)) throw new NotFoundException('Dekont dosyası bulunamadı');

    return {
      file: new StreamableFile(createReadStream(full)),
      fileName: app.paymentReceiptFileName || 'dekont',
    };
  }
}
