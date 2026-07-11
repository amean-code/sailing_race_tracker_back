import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE } from '../common/constants';
import { Roles } from '../common/decorators';
import { UpdateSignalFlagCatalogDto } from './dto/signal-flags.dto';
import { SignalFlagsService } from './signal-flags.service';

@ApiTags('signal-flags')
@Controller('signal-flags')
@ApiCookieAuth(AUTH_COOKIE)
@Roles('ADMIN', 'COMMITTEE')
export class SignalFlagsController {
  constructor(private readonly signalFlagsService: SignalFlagsService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Sinyal bayrak kataloğunu getir' })
  getCatalog() {
    return this.signalFlagsService.getCatalog();
  }

  @Put('catalog')
  @ApiOperation({ summary: 'Sinyal bayrak kataloğunu güncelle' })
  updateCatalog(@Body() dto: UpdateSignalFlagCatalogDto) {
    return this.signalFlagsService.updateCatalog(dto);
  }

  @Post('catalog/reset')
  @ApiOperation({ summary: 'Sinyal bayrak kataloğunu varsayılana döndür' })
  resetCatalog() {
    return this.signalFlagsService.resetCatalog();
  }
}
