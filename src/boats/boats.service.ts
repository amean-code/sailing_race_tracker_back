import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Boat } from '../entities/boat.entity';
import { CreateBoatDto, UpdateBoatDto } from './dto/boat.dto';

@Injectable()
export class BoatsService {
  constructor(
    @InjectRepository(Boat)
    private readonly boatsRepo: Repository<Boat>,
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
      createdAt: boat.createdAt.toISOString(),
      updatedAt: boat.updatedAt.toISOString(),
    };
  }

  async findAll(raceId?: string) {
    const boats = await this.boatsRepo.find({
      where: raceId ? { raceId } : {},
      order: { name: 'ASC' },
    });
    return boats.map((b) => this.serialize(b));
  }

  async findByUserId(userId: string) {
    const boats = await this.boatsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return boats.map((b) => this.serialize(b));
  }

  async findOne(id: string) {
    const boat = await this.boatsRepo.findOne({ where: { id } });
    if (!boat) throw new NotFoundException('Tekne bulunamadı');
    return this.serialize(boat);
  }

  async create(dto: CreateBoatDto, userId?: string) {
    const boat = this.boatsRepo.create({
      name: dto.name,
      status: dto.status ?? 'idle',
      userId: dto.userId ?? userId ?? null,
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
    });
    const saved = await this.boatsRepo.save(boat);
    return this.serialize(saved);
  }

  async update(id: string, dto: UpdateBoatDto) {
    const boat = await this.boatsRepo.findOne({ where: { id } });
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
    const saved = await this.boatsRepo.save(boat);
    return this.serialize(saved);
  }

  async remove(id: string) {
    const result = await this.boatsRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Tekne bulunamadı');
    return { ok: true };
  }

  async removeOwned(id: string, userId: string) {
    const boat = await this.boatsRepo.findOne({ where: { id } });
    if (!boat) throw new NotFoundException('Tekne bulunamadı');
    if (boat.userId !== userId) throw new ForbiddenException('Bu tekne size ait değil');
    await this.boatsRepo.remove(boat);
    return { ok: true };
  }
}
