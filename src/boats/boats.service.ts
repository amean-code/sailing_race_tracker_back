import { Injectable, NotFoundException } from '@nestjs/common';
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
    const saved = await this.boatsRepo.save(boat);
    return this.serialize(saved);
  }

  async remove(id: string) {
    const result = await this.boatsRepo.delete({ id });
    if (!result.affected) throw new NotFoundException('Tekne bulunamadı');
    return { ok: true };
  }
}
