import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CheckpointDto } from '../../courses/dto/course.dto';

export class CreateCourseExportDto {
  @ApiPropertyOptional({ example: 'Bodrum Parkur' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Bodrum - Körmen' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  raceTitle?: string;

  @ApiProperty({ type: [CheckpointDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints!: CheckpointDto[];
}
