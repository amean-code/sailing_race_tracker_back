import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApplicationsService } from './applications.service';
import { BulkUpdateApplicationDto, ReviewPaymentDto, UpdateApplicationDto } from './dto/application.dto';
import { CurrentUser, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';
import {
  RECEIPTS_DIR,
  UPLOAD_LIMITS,
  createUploadStorage,
  fileFilter,
} from '../common/upload';

@ApiTags('applications')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiQuery({ name: 'raceId', required: false })
  @ApiOperation({ summary: 'Tüm yarış başvuruları' })
  async findAll(
    @CurrentUser() user: SessionUser,
    @Query('raceId') raceId?: string,
  ) {
    const applications = await this.applicationsService.findAll(user, raceId);
    return { applications };
  }

  @Patch(':id')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Başvuru güncelle (onay, not vb.)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: SessionUser,
  ) {
    const application = await this.applicationsService.update(id, dto, user);
    return { application };
  }

  @Post('bulk-update')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Toplu başvuru durumu güncelle' })
  async bulkUpdate(
    @Body() dto: BulkUpdateApplicationDto,
    @CurrentUser() user: SessionUser,
  ) {
    const applications = await this.applicationsService.bulkUpdate(dto, user);
    return { applications };
  }

  @Post(':id/payment-receipt')
  @Roles('SAILOR', 'ADMIN', 'SUPER_ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Başvuru için ödeme dekontu yükle' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: createUploadStorage(RECEIPTS_DIR),
      fileFilter,
      limits: UPLOAD_LIMITS,
    }),
  )
  async uploadPaymentReceipt(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Dekont dosyası gerekli');
    const application = await this.applicationsService.uploadPaymentReceipt(id, user, file);
    return { application };
  }

  @Patch(':id/payment')
  @Roles('COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ödeme dekontunu onayla veya reddet' })
  async reviewPayment(
    @Param('id') id: string,
    @Body() dto: ReviewPaymentDto,
    @CurrentUser() user: SessionUser,
  ) {
    const application = await this.applicationsService.reviewPayment(id, dto, user);
    return { application };
  }

  @Get(':id/payment-receipt')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ödeme dekontunu indir/görüntüle' })
  async getPaymentReceipt(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, fileName } = await this.applicationsService.getPaymentReceiptFile(id, user);
    res.set({
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    return file;
  }
}
