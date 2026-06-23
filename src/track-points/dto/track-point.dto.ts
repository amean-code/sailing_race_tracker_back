import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TrackPointInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  boatId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  raceId?: string | null;

  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  heading?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  speed?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  accuracy?: number | null;

  @ApiPropertyOptional({ description: 'Client ms timestamp' })
  @IsOptional()
  @IsNumber()
  timestamp?: number;

  @ApiPropertyOptional({ description: 'ISO recordedAt (legacy)' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class SyncTrackPointsDto {
  @ApiProperty({ type: [TrackPointInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TrackPointInputDto)
  points!: TrackPointInputDto[];
}
