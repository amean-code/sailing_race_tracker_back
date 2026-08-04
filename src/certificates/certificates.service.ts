import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync } from 'fs';
import { Repository } from 'typeorm';
import { Certificate } from '../entities/certificate.entity';
import { SessionUser } from '../common/decorators';
import { UserRoleEnum } from '../common/constants';
import {
  absoluteUploadPath,
  deleteUploadFile,
  relativeUploadPath,
  CERTIFICATES_DIR,
} from '../common/upload';
import { CreateCertificateDto, UpdateCertificateDto } from './dto/certificate.dto';

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(Certificate)
    private readonly certificatesRepo: Repository<Certificate>,
  ) {}

  serialize(cert: Certificate, includeUser = false) {
    const base: Record<string, unknown> = {
      id: cert.id,
      userId: cert.userId,
      type: cert.type,
      title: cert.title,
      fileName: cert.fileName,
      mimeType: cert.mimeType,
      notes: cert.notes,
      expiresAt: cert.expiresAt?.toISOString() ?? null,
      fileUrl: `/api/certificates/${cert.id}/file`,
      createdAt: cert.createdAt.toISOString(),
      updatedAt: cert.updatedAt.toISOString(),
    };
    if (includeUser && cert.user) {
      base.user = {
        id: cert.user.id,
        name: cert.user.name,
        email: cert.user.email,
      };
    }
    return base;
  }

  async findMine(userId: string) {
    const list = await this.certificatesRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return list.map((c) => this.serialize(c));
  }

  async findAll() {
    const list = await this.certificatesRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    return list.map((c) => this.serialize(c, true));
  }

  async findOneEntity(id: string) {
    const cert = await this.certificatesRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!cert) throw new NotFoundException('Sertifika bulunamadı');
    return cert;
  }

  async create(userId: string, dto: CreateCertificateDto, file: Express.Multer.File) {
    if (!file) throw new NotFoundException('Dosya gerekli');
    const cert = this.certificatesRepo.create({
      userId,
      type: dto.type,
      title: dto.title.trim(),
      notes: dto.notes?.trim() || null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      filePath: relativeUploadPath(CERTIFICATES_DIR, file.filename),
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
    const saved = await this.certificatesRepo.save(cert);
    return this.serialize(saved);
  }

  async update(id: string, user: SessionUser, dto: UpdateCertificateDto) {
    const cert = await this.findOneEntity(id);
    this.assertOwnerOrAdmin(cert, user);
    if (dto.type !== undefined) cert.type = dto.type;
    if (dto.title !== undefined) cert.title = dto.title.trim();
    if (dto.notes !== undefined) cert.notes = dto.notes;
    if (dto.expiresAt !== undefined) {
      cert.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    const saved = await this.certificatesRepo.save(cert);
    return this.serialize(saved, !!cert.user);
  }

  async remove(id: string, user: SessionUser) {
    const cert = await this.findOneEntity(id);
    this.assertOwnerOrAdmin(cert, user);
    deleteUploadFile(cert.filePath);
    await this.certificatesRepo.remove(cert);
    return { ok: true };
  }

  async getFileStream(id: string, user: SessionUser): Promise<{ file: StreamableFile; fileName: string; mimeType: string }> {
    const cert = await this.findOneEntity(id);
    this.assertCanView(cert, user);
    const full = absoluteUploadPath(cert.filePath);
    if (!existsSync(full)) throw new NotFoundException('Dosya bulunamadı');
    return {
      file: new StreamableFile(createReadStream(full)),
      fileName: cert.fileName,
      mimeType: cert.mimeType || 'application/octet-stream',
    };
  }

  async findOwnedByIds(userId: string, ids: string[]) {
    if (!ids.length) return [];
    const list = await this.certificatesRepo.find({
      where: ids.map((id) => ({ id, userId })),
    });
    return list;
  }

  private assertOwnerOrAdmin(cert: Certificate, user: SessionUser) {
    if (cert.userId === user.sub) return;
    if (user.role === UserRoleEnum.ADMIN || user.role === UserRoleEnum.SUPER_ADMIN) return;
    throw new ForbiddenException('Bu sertifikaya erişim yok');
  }

  private assertCanView(cert: Certificate, user: SessionUser) {
    if (cert.userId === user.sub) return;
    if (
      user.role === UserRoleEnum.ADMIN ||
      user.role === UserRoleEnum.SUPER_ADMIN ||
      user.role === UserRoleEnum.COMMITTEE
    ) {
      return;
    }
    throw new ForbiddenException('Bu sertifikaya erişim yok');
  }
}
