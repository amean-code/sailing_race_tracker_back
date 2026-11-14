import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Feedback } from '../entities/feedback.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import {
  CreateFeedbackDto,
  CreateFeedbackFormDto,
  UpdateFeedbackDto,
  UpdateFeedbackFormDto,
} from './dto/feedback.dto';

function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'feedback';
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
    @InjectRepository(FeedbackForm)
    private readonly formRepo: Repository<FeedbackForm>,
  ) {}

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyTitle(title);
    for (let i = 0; i < 8; i += 1) {
      const suffix = randomBytes(3).toString('hex');
      const slug = `${base}-${suffix}`;
      const exists = await this.formRepo.exist({ where: { slug } });
      if (!exists) return slug;
    }
    return `${base}-${randomBytes(6).toString('hex')}`;
  }

  async createForm(dto: CreateFeedbackFormDto): Promise<FeedbackForm> {
    const title = dto.title.trim();
    const description = dto.description.trim();
    if (!title || !description) {
      throw new BadRequestException('Başlık ve açıklama zorunludur');
    }
    const form = this.formRepo.create({
      title,
      description,
      slug: await this.uniqueSlug(title),
      active: true,
    });
    return this.formRepo.save(form);
  }

  async listForms(): Promise<{
    items: Array<FeedbackForm & { responseCount: number; newCount: number }>;
  }> {
    const forms = await this.formRepo.find({ order: { createdAt: 'DESC' } });
    const items = await Promise.all(
      forms.map(async (form) => {
        const responseCount = await this.feedbackRepo.count({
          where: { formId: form.id },
        });
        const newCount = await this.feedbackRepo.count({
          where: { formId: form.id, status: 'new' },
        });
        return Object.assign(form, { responseCount, newCount });
      }),
    );
    return { items };
  }

  async getFormById(id: string): Promise<FeedbackForm> {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Geri bildirim formu bulunamadı');
    return form;
  }

  async getPublicFormBySlug(slug: string): Promise<Pick<FeedbackForm, 'title' | 'description' | 'slug'>> {
    const form = await this.formRepo.findOne({ where: { slug, active: true } });
    if (!form) throw new NotFoundException('Geri bildirim formu bulunamadı veya kapalı');
    return {
      title: form.title,
      description: form.description,
      slug: form.slug,
    };
  }

  async updateForm(id: string, dto: UpdateFeedbackFormDto): Promise<FeedbackForm> {
    const form = await this.getFormById(id);
    if (dto.title != null) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Başlık zorunludur');
      form.title = title;
    }
    if (dto.description != null) {
      const description = dto.description.trim();
      if (!description) throw new BadRequestException('Açıklama zorunludur');
      form.description = description;
    }
    if (dto.active != null) form.active = dto.active;
    return this.formRepo.save(form);
  }

  async removeForm(id: string): Promise<void> {
    const result = await this.formRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Geri bildirim formu bulunamadı');
    }
  }

  async createResponse(slug: string, dto: CreateFeedbackDto): Promise<Feedback> {
    const form = await this.formRepo.findOne({ where: { slug, active: true } });
    if (!form) {
      throw new NotFoundException('Geri bildirim formu bulunamadı veya kapalı');
    }

    const name = dto.name.trim();
    const issue = dto.issue.trim();
    if (!name || !issue) {
      throw new BadRequestException('İsim ve sorun alanları zorunludur');
    }
    const suggestion =
      dto.suggestion != null && String(dto.suggestion).trim()
        ? String(dto.suggestion).trim()
        : null;

    const feedback = this.feedbackRepo.create({
      formId: form.id,
      name,
      issue,
      suggestion,
      status: 'new',
    });
    return this.feedbackRepo.save(feedback);
  }

  async findResponses(
    formId?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: Feedback[]; total: number }> {
    const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
    const skip = Number.isFinite(offset) ? Math.max(offset, 0) : 0;

    const where = formId ? { formId } : {};
    const [items, total] = await this.feedbackRepo.findAndCount({
      where,
      relations: ['form'],
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total };
  }

  async updateResponse(id: string, dto: UpdateFeedbackDto): Promise<Feedback> {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: ['form'],
    });
    if (!feedback) {
      throw new NotFoundException('Geri bildirim bulunamadı');
    }
    feedback.status = dto.status;
    return this.feedbackRepo.save(feedback);
  }

  async removeResponse(id: string): Promise<void> {
    const result = await this.feedbackRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Geri bildirim bulunamadı');
    }
  }
}
