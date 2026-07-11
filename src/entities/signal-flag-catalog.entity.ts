import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { SignalFlagCatalog } from '../signal-flags/signal-flags.constants';

@Entity('signal_flag_catalogs')
export class SignalFlagCatalogEntity {
  @PrimaryColumn({ type: 'text', default: 'default' })
  id!: string;

  @Column({ type: 'jsonb' })
  catalog!: SignalFlagCatalog;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
