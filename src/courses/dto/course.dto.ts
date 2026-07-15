import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckpointDto {
  @ApiProperty({ example: 'B1' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 'buoy' })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ example: 'buoy' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: [37.01, 27.4] })
  @IsOptional()
  coord?: [number, number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  coords?: [number, number][];

  @ApiPropertyOptional({ enum: ['port', 'starboard'] })
  @IsOptional()
  @IsString()
  rounding?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  crossing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rotationDeg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lineLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  bearingDeg?: number;

  @ApiPropertyOptional({ enum: ['port', 'starboard'] })
  @IsOptional()
  @IsString()
  flagSide?: string;
}

export class CreateCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Bodrum Bay Offshore' })
  @IsString()
  @MinLength(1, { message: 'Parkur adı gerekli' })
  name!: string;

  @ApiProperty({ type: [CheckpointDto], default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints!: CheckpointDto[];
}

export class UpdateCourseDto extends CreateCourseDto {}

import { CourseStatusEnum } from '../../common/constants';
import { IsEnum } from 'class-validator';

export class UpdateCourseStatusDto {
  @ApiProperty({ enum: CourseStatusEnum })
  @IsEnum(CourseStatusEnum)
  status!: CourseStatusEnum;
}

export class TransferCourseDto {
  @ApiProperty()
  @IsString()
  newOwnerId!: string;
}
