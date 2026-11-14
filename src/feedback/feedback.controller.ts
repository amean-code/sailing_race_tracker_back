import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE } from '../common/constants';
import { Public, Roles } from '../common/decorators';
import {
  CreateFeedbackDto,
  CreateFeedbackFormDto,
  UpdateFeedbackDto,
  UpdateFeedbackFormDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // ── Forms (admin) ──────────────────────────────────────────────────────────

  @Post('forms')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Geri bildirim formu oluştur (link üretir)' })
  async createForm(@Body() dto: CreateFeedbackFormDto) {
    const form = await this.feedbackService.createForm(dto);
    return { form };
  }

  @Get('forms')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Geri bildirim formları' })
  async listForms() {
    return this.feedbackService.listForms();
  }

  @Patch('forms/:id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Geri bildirim formunu güncelle' })
  async updateForm(@Param('id') id: string, @Body() dto: UpdateFeedbackFormDto) {
    const form = await this.feedbackService.updateForm(id, dto);
    return { form };
  }

  @Delete('forms/:id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Geri bildirim formunu sil' })
  async removeForm(@Param('id') id: string) {
    await this.feedbackService.removeForm(id);
    return { ok: true };
  }

  // ── Public form + submit ───────────────────────────────────────────────────

  @Public()
  @Get('forms/by-slug/:slug')
  @ApiOperation({ summary: 'Herkese açık form meta (başlık + açıklama)' })
  async getPublicForm(@Param('slug') slug: string) {
    const form = await this.feedbackService.getPublicFormBySlug(slug);
    return { form };
  }

  @Public()
  @Post('forms/by-slug/:slug/responses')
  @ApiOperation({ summary: 'Form linki üzerinden geri bildirim gönder' })
  async createResponse(
    @Param('slug') slug: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    const feedback = await this.feedbackService.createResponse(slug, dto);
    return { feedback: { id: feedback.id, createdAt: feedback.createdAt } };
  }

  // ── Responses (admin) ──────────────────────────────────────────────────────

  @Get('responses')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Geri bildirim yanıtları' })
  async listResponses(
    @Query('formId') formId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.feedbackService.findResponses(formId, limit, offset);
  }

  @Patch('responses/:id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yanıt durumunu güncelle' })
  async updateResponse(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    const feedback = await this.feedbackService.updateResponse(id, dto);
    return { feedback };
  }

  @Delete('responses/:id')
  @ApiCookieAuth(AUTH_COOKIE)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Yanıtı sil' })
  async removeResponse(@Param('id') id: string) {
    await this.feedbackService.removeResponse(id);
    return { ok: true };
  }
}
