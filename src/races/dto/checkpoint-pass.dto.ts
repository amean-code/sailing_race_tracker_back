import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordCheckpointPassDto {
  @ApiProperty({ description: 'Application ID of the racer' })
  @IsString()
  applicationId!: string;

  @ApiProperty({ description: '0 = start line, 1 = first buoy, etc.' })
  @IsNumber()
  checkpointIndex!: number;

  @ApiProperty({ description: 'Checkpoint identifier string (e.g. S, B1, F)' })
  @IsString()
  checkpointId!: string;

  @ApiProperty({ description: 'ISO timestamp when boat crossed the checkpoint' })
  @IsString()
  passedAt!: string;

  @ApiProperty({ description: 'Seconds elapsed since race start', required: false })
  @IsOptional()
  @IsNumber()
  elapsedSeconds?: number;
}
