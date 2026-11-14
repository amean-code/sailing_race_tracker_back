import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TrackPointSourceEnum } from '../../common/constants';

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

  @ApiPropertyOptional({
    description: 'Provenance — set by server paths; PWA clients should omit',
    enum: TrackPointSourceEnum,
  })
  @IsOptional()
  @IsIn([TrackPointSourceEnum.PWA, TrackPointSourceEnum.DEVICE])
  source?: TrackPointSourceEnum | null;

  @ApiPropertyOptional({
    description: 'Idempotency key override (device ingest uses device:{id}:{ts})',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  clientKey?: string | null;

  @ApiPropertyOptional({
    description: 'Source device id when source=device; set by device ingest only',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  deviceId?: string | null;
}

export class SyncTrackPointsDto {
  @ApiProperty({ type: [TrackPointInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TrackPointInputDto)
  points!: TrackPointInputDto[];

  @ApiPropertyOptional({
    description:
      'When true, PWA points for boats in this batch become the active live source even if a device is live. Device rows are still persisted.',
  })
  @IsOptional()
  @IsBoolean()
  preferPhoneSource?: boolean;
}
