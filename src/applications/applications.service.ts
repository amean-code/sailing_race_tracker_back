import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createReadStream, existsSync } from 'fs';
import { RaceApplication } from '../entities/race-application.entity';
import { Boat } from '../entities/boat.entity';
import { Race } from '../entities/race.entity';
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

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    @InjectRepository(Race)
    private readonly racesRepo: Repository<Race>,
    private eventEmitter: EventEmitter2,
  ) {}

  serialize(app: RaceApplication) {
    return {
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
      status: app.status,
      boatId: app.boatId,
      userId: app.userId,
      checkedInAt: app.checkedInAt?.toISOString() ?? null,
      finishPosition: app.finishPosition,
      fleetSize: app.fleetSize,
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

  async findAll(user?: SessionUser, raceId?: string) {
    const qb = this.applicationsRepo.createQueryBuilder('app')
      .leftJoinAndSelect('app.race', 'race')
      .orderBy('app.createdAt', 'DESC');

    if (raceId) {
      qb.andWhere('app.raceId = :raceId', { raceId });
    }

    if (user?.role === UserRoleEnum.COMMITTEE) {
      qb.andWhere('race.assignedCommitteeId = :userId', { userId: user.sub });
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

  async update(id: string, dto: UpdateApplicationDto, user?: SessionUser) {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['race'],
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı');

    if (
      user?.role === UserRoleEnum.COMMITTEE &&
      app.race?.assignedCommitteeId !== user.sub
    ) {
      throw new ForbiddenException('Bu yarış size atanmamış.');
    }

    if (dto.status !== undefined) {
      if (app.status === ApplicationStatusEnum.APPROVED && dto.status === ApplicationStatusEnum.APPROVED) {
        // Already approved, no-op for boat creation
      }
      app.status = dto.status;

      if (
        dto.status === ApplicationStatusEnum.DNS ||
        dto.status === ApplicationStatusEnum.DNF ||
        dto.status === ApplicationStatusEnum.DSQ
      ) {
        app.finishPosition = null;
      }

      if (dto.status === ApplicationStatusEnum.APPROVED) {
        let boat = await this.boatsRepo.findOne({ where: { applicationId: app.id } });
        if (!boat) {
          const existingCount = await this.boatsRepo.count({
            where: { raceId: app.raceId, status: 'registered' },
          });

          boat = this.boatsRepo.create({
            name: app.boatName,
            sailNumber: app.sailNumber,
            competitorName: app.name,
            applicationId: app.id,
            raceId: app.raceId,
            courseId: app.race?.courseId ?? null,
            status: 'registered',
            displayColor: this.pickColor(existingCount),
            crewMembers: app.crewMembers ?? null,
          });
          await this.boatsRepo.save(boat);
          app.boatId = boat.id;
          app.checkedInAt = new Date();
          this.eventEmitter.emit('boat.checked_in', {
            raceId: app.raceId,
            boatId: boat.id,
            userId: user?.sub,
          });
        }
      }
    }
    if (dto.notes !== undefined) app.notes = dto.notes;

    const saved = await this.applicationsRepo.save(app);
    return this.serialize(saved);
  }

  async bulkUpdate(dto: BulkUpdateApplicationDto, user?: SessionUser) {
    if (!dto.ids || dto.ids.length === 0) {
      throw new BadRequestException('En az bir başvuru seçilmelidir');
    }

    const apps = await this.applicationsRepo.find({
      where: { id: In(dto.ids) },
      relations: ['race'],
    });

    if (apps.length === 0) throw new NotFoundException('Başvurular bulunamadı');

    const results: ReturnType<typeof this.serialize>[] = [];

    for (const app of apps) {
      app.status = dto.status;

      if (
        dto.status === ApplicationStatusEnum.DNS ||
        dto.status === ApplicationStatusEnum.DNF ||
        dto.status === ApplicationStatusEnum.DSQ
      ) {
        app.finishPosition = null;
      }

      if (dto.status === ApplicationStatusEnum.APPROVED) {
        let boat = await this.boatsRepo.findOne({ where: { applicationId: app.id } });
        if (!boat) {
          const existingCount = await this.boatsRepo.count({
            where: { raceId: app.raceId, status: 'registered' },
          });
          boat = this.boatsRepo.create({
            name: app.boatName,
            sailNumber: app.sailNumber,
            competitorName: app.name,
            applicationId: app.id,
            raceId: app.raceId,
            courseId: app.race?.courseId ?? null,
            status: 'registered',
            displayColor: this.pickColor(existingCount),
            crewMembers: app.crewMembers,
          });
          await this.boatsRepo.save(boat);
          app.boatId = boat.id;
          app.checkedInAt = new Date();
          this.eventEmitter.emit('boat.checked_in', {
            raceId: app.raceId,
            boatId: boat.id,
            userId: user?.sub,
          });
        }
      }

      const saved = await this.applicationsRepo.save(app);
      results.push(this.serialize(saved));
    }

    return results;
  }

  private async getAppWithRace(id: string) {
    const app = await this.applicationsRepo.findOne({
      where: { id },
      relations: ['race'],
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
    if (user.role === UserRoleEnum.ADMIN || user.role === UserRoleEnum.SUPER_ADMIN) return;
    if (
      user.role === UserRoleEnum.COMMITTEE &&
      app.race?.assignedCommitteeId === user.sub
    ) {
      return;
    }
    throw new ForbiddenException('Bu başvuruyu yönetme yetkiniz yok');
  }

  async uploadPaymentReceipt(id: string, user: SessionUser, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Dekont dosyası gerekli');
    const app = await this.getAppWithRace(id);
    this.assertSailorOwns(app, user);

    deleteUploadFile(app.paymentReceiptPath);
    app.paymentReceiptPath = relativeUploadPath(RECEIPTS_DIR, file.filename);
    app.paymentReceiptFileName = file.originalname;
    app.paymentStatus = PaymentStatusEnum.PENDING;
    app.paymentNote = null;
    app.paymentReviewedAt = null;
    if (!app.userId) app.userId = user.sub;

    const saved = await this.applicationsRepo.save(app);
    return this.serialize(saved);
  }

  async reviewPayment(id: string, dto: ReviewPaymentDto, user: SessionUser) {
    const app = await this.getAppWithRace(id);
    this.assertCanManageApp(app, user);

    if (!app.paymentReceiptPath && dto.status === PaymentStatusEnum.APPROVED) {
      throw new BadRequestException('Dekont yüklenmeden ödeme onaylanamaz');
    }

    app.paymentStatus = dto.status;
    app.paymentNote = dto.note?.trim() || null;
    app.paymentReviewedAt = new Date();

    const saved = await this.applicationsRepo.save(app);
    return this.serialize(saved);
  }

  async getPaymentReceiptFile(id: string, user: SessionUser): Promise<{
    file: StreamableFile;
    fileName: string;
  }> {
    const app = await this.getAppWithRace(id);

    const isOwner =
      app.userId === user.sub ||
      (user.email && app.email?.toLowerCase() === user.email.toLowerCase());
    const isStaff =
      user.role === UserRoleEnum.ADMIN ||
      user.role === UserRoleEnum.SUPER_ADMIN ||
      (user.role === UserRoleEnum.COMMITTEE && app.race?.assignedCommitteeId === user.sub);

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
