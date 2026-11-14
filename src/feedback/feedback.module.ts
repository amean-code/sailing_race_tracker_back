import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from '../entities/feedback.entity';
import { FeedbackForm } from '../entities/feedback-form.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [TypeOrmModule.forFeature([Feedback, FeedbackForm])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
