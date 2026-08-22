import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RaceResultStatusEnum } from '../common/constants';
import { Race } from './race.entity';
import { RaceApplication } from './race-application.entity';

@Entity('race_results')
@Unique(['applicationId', 'raceId'])
export class RaceResult {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'application_id' })
  applicationId!: string;

  @Column({ name: 'race_id' })
  raceId!: string;

  @Column({ name: 'finish_position', type: 'int', nullable: true })
  finishPosition!: number | null;

  @Column({
    type: 'text',
    default: RaceResultStatusEnum.PENDING,
  })
  status!: RaceResultStatusEnum | string;

  @Column({ name: 'fleet_size', type: 'int', nullable: true })
  fleetSize!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => RaceApplication, (app) => app.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'application_id' })
  application!: RaceApplication;

  @ManyToOne(() => Race, (race) => race.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'race_id' })
  race!: Race;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
