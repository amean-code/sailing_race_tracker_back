import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Boat } from '../entities/boat.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Certificate } from '../entities/certificate.entity';
import { CreateBoatDto, UpdateBoatDto } from './dto/boat.dto';

@Injectable()
export class BoatsService {
  constructor(
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
    @InjectRepository(RaceApplication)
    private readonly applicationsRepo: Repository<RaceApplication>,
    @InjectRepository(Certificate)
    private readonly certificatesRepo: Repository<Certificate>,
  ) {}

  serialize(boat: Boat) {
    return {
      id: boat.id,
      name: boat.name,
      status: boat.status,
      userId: boat.userId,
      courseId: boat.courseId,
      raceId: boat.raceId,
      applicationId: boat.applicationId,
      sailNumber: boat.sailNumber,
      displayColor: boat.displayColor,
      competitorName: boat.competitorName,
      photoUrl: boat.photoUrl,
      club: boat.club,
      boatClass: boat.boatClass,
      length: boat.length,
      width: boat.width,
      color: boat.color,
      crewMembers: boat.crewMembers,
      certificates: (boat.certificates || []).map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        fileName: c.fileName,
        fileUrl: `/api/certificates/${c.id}/file`,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      })),
      certificateIds: (boat.certificates || []).map((c) => c.id),
      createdAt: boat.createdAt.toISOString(),
      updatedAt: boat.updatedAt.toISOString(),
    };
  }

  async findAll(raceId?: string) {
    const boats = await this.boatsRepo.find({
      where: raceId ? { raceId, isActive: true } : { isActive: true },
      relations: ['certificates'],
      order: { name: 'ASC' },
    });
    return boats.map((b) => this.serialize(b));
  }

  async findByUserId(userId: string) {
    const boats = await this.boatsRepo.find({
      where: { userId, isActive: true },
      relations: ['certificates'],
      order: { createdAt: 'DESC' },
    });
    return boats.map((b) => this.serialize(b));
  }

  async findOne(id: string) {
    const boat = await this.boatsRepo.findOne({
      where: { id },
      relations: ['certificates'],
    });
    if (!boat) throw new NotFoundException('Tekne bulunamadı');
    return this.serialize(boat);
  }

  private async resolveCertificates(userId: string | null | undefined, ids?: string[]) {
    if (!ids || ids.length === 0) return [];
    if (!userId) return [];
    return this.certificatesRepo.find({
      where: { userId, id: In(ids) },
    });
  }

  async create(dto: CreateBoatDto, userId?: string) {
    const ownerId = dto.userId ?? userId ?? null;
    const certificates = await this.resolveCertificates(ownerId, dto.certificateIds);
    const boat = this.boatsRepo.create({
      name: dto.name,
      status: dto.status ?? 'idle',
      userId: ownerId,
      courseId: dto.courseId ?? null,
      raceId: dto.raceId ?? null,
      sailNumber: dto.sailNumber ?? null,
      competitorName: dto.competitorName ?? null,
      photoUrl: dto.photoUrl ?? null,
      club: dto.club ?? null,
      boatClass: dto.boatClass ?? null,
      length: dto.length ?? null,
      width: dto.width ?? null,
      color: dto.color ?? null,
      crewMembers: dto.crewMembers ?? null,
      certificates,
    });
    const saved = await this.boatsRepo.save(boat);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateBoatDto, userId?: string) {
    const boat = await this.boatsRepo.findOne({
      where: { id },
      relations: ['certificates'],
    });
    if (!boat) throw new NotFoundException('Tekne bulunamadı');
    if (dto.name !== undefined) boat.name = dto.name;
    if (dto.status !== undefined) boat.status = dto.status;
    if (dto.courseId !== undefined) boat.courseId = dto.courseId;
    if (dto.raceId !== undefined) boat.raceId = dto.raceId;
    if (dto.sailNumber !== undefined) boat.sailNumber = dto.sailNumber;
    if (dto.competitorName !== undefined) boat.competitorName = dto.competitorName;
    if (dto.photoUrl !== undefined) boat.photoUrl = dto.photoUrl;
    if (dto.club !== undefined) boat.club = dto.club;
    if (dto.boatClass !== undefined) boat.boatClass = dto.boatClass;
    if (dto.length !== undefined) boat.length = dto.length;
    if (dto.width !== undefined) boat.width = dto.width;
    if (dto.color !== undefined) boat.color = dto.color;
    if (dto.crewMembers !== undefined) boat.crewMembers = dto.crewMembers;
    if (dto.certificateIds !== undefined) {
      const ownerId = boat.userId ?? userId ?? null;
      boat.certificates = await this.resolveCertificates(ownerId, dto.certificateIds);
    }
    await this.boatsRepo.save(boat);
    return this.findOne(id);
  }

  async remove(id: string) {
    const isUsed = await this.applicationsRepo.count({ where: { boatId: id } });
    if (isUsed > 0) {
      const result = await this.boatsRepo.update({ id }, { isActive: false });
      if (!result.affected) throw new NotFoundException('Tekne bulunamadı');
    } else {
      const result = await this.boatsRepo.delete({ id });
      if (!result.affected) throw new NotFoundException('Tekne bulunamadı');
    }
    return { ok: true };
  }

  async removeOwned(id: string, userId: string) {
    const boat = await this.boatsRepo.findOne({ where: { id } });
    if (!boat) throw new NotFoundException('Tekne bulunamadı');
    if (boat.userId !== userId) throw new ForbiddenException('Bu tekne size ait değil');

    const isUsed = await this.applicationsRepo.count({ where: { boatId: id } });
    if (isUsed > 0) {
      boat.isActive = false;
      await this.boatsRepo.save(boat);
    } else {
      await this.boatsRepo.remove(boat);
    }
    return { ok: true };
  }
}
