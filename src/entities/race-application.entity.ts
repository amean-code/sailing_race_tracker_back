import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Race } from './race.entity';

@Entity('race_applications')
@Unique(['raceId', 'email'])
export class RaceApplication {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'race_id' })
  raceId!: string;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'boat_name' })
  boatName!: string;

  @Column({ name: 'sail_number' })
  sailNumber!: string;

  @Column({ type: 'text', nullable: true })
  club!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'finish_position', type: 'int', nullable: true })
  finishPosition!: number | null;

  @Column({ name: 'fleet_size', type: 'int', nullable: true })
  fleetSize!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Race, (race) => race.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'race_id' })
  race!: Race;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }
}
