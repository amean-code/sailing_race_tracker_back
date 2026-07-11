import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SignalFlagCatalogEntity } from '../entities/signal-flag-catalog.entity';
import {
  DEFAULT_SIGNAL_FLAG_CATALOG,
  SignalFlagCatalog,
  SignalFlagDefinition,
  SequenceOptionDefinition,
} from './signal-flags.constants';
import { UpdateSignalFlagCatalogDto } from './dto/signal-flags.dto';

@Injectable()
export class SignalFlagsService {
  constructor(
    @InjectRepository(SignalFlagCatalogEntity)
    private readonly catalogRepo: Repository<SignalFlagCatalogEntity>,
  ) {}

  private normalizeFlag(flag: SignalFlagDefinition): SignalFlagDefinition {
    return {
      key: flag.key.trim(),
      label: flag.label.trim(),
      color: flag.color.trim(),
      descriptionTr: flag.descriptionTr?.trim() || undefined,
      descriptionEn: flag.descriptionEn?.trim() || undefined,
    };
  }

  private normalizeSequence(option: SequenceOptionDefinition): SequenceOptionDefinition {
    return {
      key: option.key.trim(),
      labelTr: option.labelTr.trim(),
      labelEn: option.labelEn.trim(),
    };
  }

  private validateCatalog(catalog: SignalFlagCatalog) {
    const groups: Array<{ name: string; items: SignalFlagDefinition[] }> = [
      { name: 'classFlags', items: catalog.classFlags },
      { name: 'generalFlags', items: catalog.generalFlags },
      { name: 'preparatoryFlags', items: catalog.preparatoryFlags },
    ];

    for (const group of groups) {
      if (group.items.length === 0) {
        throw new BadRequestException(`${group.name} must contain at least one item`);
      }
      const keys = group.items.map((item) => item.key);
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException(`Duplicate keys in ${group.name}`);
      }
    }

    if (catalog.sequenceOptions.length === 0) {
      throw new BadRequestException('sequenceOptions must contain at least one item');
    }

    const seqKeys = catalog.sequenceOptions.map((item) => item.key);
    if (new Set(seqKeys).size !== seqKeys.length) {
      throw new BadRequestException('Duplicate keys in sequenceOptions');
    }
  }

  private normalizeCatalog(dto: UpdateSignalFlagCatalogDto): SignalFlagCatalog {
    const catalog: SignalFlagCatalog = {
      classFlags: dto.classFlags.map((flag) => this.normalizeFlag(flag)),
      generalFlags: dto.generalFlags.map((flag) => this.normalizeFlag(flag)),
      preparatoryFlags: dto.preparatoryFlags.map((flag) => this.normalizeFlag(flag)),
      sequenceOptions: dto.sequenceOptions.map((option) => this.normalizeSequence(option)),
    };
    this.validateCatalog(catalog);
    return catalog;
  }

  async getCatalog(): Promise<SignalFlagCatalog> {
    let row = await this.catalogRepo.findOne({ where: { id: 'default' } });
    if (!row) {
      row = await this.catalogRepo.save(
        this.catalogRepo.create({
          id: 'default',
          catalog: DEFAULT_SIGNAL_FLAG_CATALOG,
        }),
      );
    }
    return row.catalog;
  }

  async updateCatalog(dto: UpdateSignalFlagCatalogDto): Promise<SignalFlagCatalog> {
    const catalog = this.normalizeCatalog(dto);
    let row = await this.catalogRepo.findOne({ where: { id: 'default' } });
    if (!row) {
      row = this.catalogRepo.create({ id: 'default', catalog });
    } else {
      row.catalog = catalog;
    }
    await this.catalogRepo.save(row);
    return catalog;
  }

  async resetCatalog(): Promise<SignalFlagCatalog> {
    let row = await this.catalogRepo.findOne({ where: { id: 'default' } });
    if (!row) {
      row = this.catalogRepo.create({
        id: 'default',
        catalog: DEFAULT_SIGNAL_FLAG_CATALOG,
      });
    } else {
      row.catalog = DEFAULT_SIGNAL_FLAG_CATALOG;
    }
    await this.catalogRepo.save(row);
    return DEFAULT_SIGNAL_FLAG_CATALOG;
  }
}
