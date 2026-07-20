import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../entities';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
  ) {}

  async getSetting(key: string): Promise<any> {
    const setting = await this.settingRepo.findOne({ where: { key } });
    return setting ? setting.value : null;
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    let setting = await this.settingRepo.findOne({ where: { key } });
    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingRepo.create({ key, value });
    }
    await this.settingRepo.save(setting);
    return setting;
  }
}
