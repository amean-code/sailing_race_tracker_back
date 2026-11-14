import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FeedbackForm } from './feedback-form.entity';

export type FeedbackStatus = 'new' | 'read';

@Entity('feedbacks')
@Index(['formId', 'status', 'createdAt'])
@Index(['status', 'createdAt'])
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  formId: string;

  @ManyToOne(() => FeedbackForm, (form) => form.responses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'formId' })
  form: FeedbackForm;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text' })
  issue: string;

  @Column({ type: 'text', nullable: true })
  suggestion: string | null;

  @Column({ type: 'varchar', length: 16, default: 'new' })
  status: FeedbackStatus;

  @CreateDateColumn()
  createdAt: Date;
}
