import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto, UpdateCertificateDto } from './dto/certificate.dto';
import { CurrentUser, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';
import {
  CERTIFICATES_DIR,
  UPLOAD_LIMITS,
  createUploadStorage,
  fileFilter,
} from '../common/upload';

@ApiTags('certificates')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('my')
  @Roles('SAILOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Kendi sertifikalarımı listele' })
  async findMine(@CurrentUser() user: SessionUser) {
    const certificates = await this.certificatesService.findMine(user.sub);
    return { certificates };
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'COMMITTEE')
  @ApiOperation({ summary: 'Tüm sertifikalar (yönetim)' })
  async findAll() {
    const certificates = await this.certificatesService.findAll();
    return { certificates };
  }

  @Post()
  @Roles('SAILOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sertifika yükle' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: createUploadStorage(CERTIFICATES_DIR),
      fileFilter,
      limits: UPLOAD_LIMITS,
    }),
  )
  async create(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateCertificateDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Dosya gerekli');
    const certificate = await this.certificatesService.create(user.sub, dto, file);
    return { certificate };
  }

  @Patch(':id')
  @Roles('SAILOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Sertifika güncelle' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateCertificateDto,
  ) {
    const certificate = await this.certificatesService.update(id, user, dto);
    return { certificate };
  }

  @Delete(':id')
  @Roles('SAILOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Sertifika sil' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.certificatesService.remove(id, user);
  }

  @Get(':id/file')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Sertifika dosyasını indir/görüntüle' })
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, fileName, mimeType } = await this.certificatesService.getFileStream(id, user);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    return file;
  }
}
