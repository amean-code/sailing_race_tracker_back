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
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BoatsService } from './boats.service';
import { CreateBoatDto, UpdateBoatDto } from './dto/boat.dto';
import { CurrentUser, Roles, SessionUser } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('boats')
@ApiCookieAuth(AUTH_COOKIE)
@Controller('boats')
export class BoatsController {
  constructor(private readonly boatsService: BoatsService) {}

  @Get('my')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Kendi teknelerimi listele (oturumdaki kullanıcı)' })
  async findMine(@CurrentUser() user: SessionUser) {
    const boats = await this.boatsService.findByUserId(user.sub);
    return { boats };
  }

  @Get()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiQuery({ name: 'raceId', required: false })
  @ApiOperation({ summary: 'Tekneleri listele' })
  async findAll(@Query('raceId') raceId?: string) {
    const boats = await this.boatsService.findAll(raceId);
    return { boats };
  }

  @Get(':id')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Tekne detayı' })
  async findOne(@Param('id') id: string) {
    const boat = await this.boatsService.findOne(id);
    return { boat };
  }

  @Post()
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Tekne kaydı oluştur' })
  async create(@Body() dto: CreateBoatDto, @CurrentUser() user: SessionUser) {
    const boat = await this.boatsService.create(dto, user.sub);
    return { boat };
  }

  @Patch(':id')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Tekne güncelle' })
  async update(@Param('id') id: string, @Body() dto: UpdateBoatDto, @CurrentUser() user: SessionUser) {
    // Sailors can only update their own boats; admins/committees/super_admin update any
    if (user.role === 'SAILOR') {
      const boat = await this.boatsService.findOne(id);
      if (boat.userId !== user.sub) {
        const { ForbiddenException } = await import('@nestjs/common');
        throw new ForbiddenException('Bu tekne size ait değil');
      }
    }
    const boat = await this.boatsService.update(id, dto);
    return { boat };
  }

  @Delete(':id')
  @Roles('SAILOR', 'COMMITTEE', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Tekne sil' })
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    // Sailors can only delete their own boats; admins/committees/super_admin delete any
    if (user.role === 'SAILOR') {
      return this.boatsService.removeOwned(id, user.sub);
    }
    return this.boatsService.remove(id);
  }
}
