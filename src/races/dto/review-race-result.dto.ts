import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class ReviewRaceResultDto {
  @ApiProperty({ enum: ['confirm_pass', 'reject_pass', 'accept_race'] })
  @IsIn(['confirm_pass', 'reject_pass', 'accept_race'])
  action!: 'confirm_pass' | 'reject_pass' | 'accept_race';

  @ApiPropertyOptional({ description: 'Checkpoint index for confirm_pass / reject_pass' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  checkpointIndex?: number;
}
