import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFeedbackFormDto {
  @ApiProperty({ description: 'Form adı (ör. Bodrum yarışı feedbacki)', maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ description: 'Sayfa üst açıklaması', maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;
}

export class UpdateFeedbackFormDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateFeedbackDto {
  @ApiProperty({ description: 'Gönderen ismi', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Yaşanan sorun', maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  issue!: string;

  @ApiPropertyOptional({ description: 'Opsiyonel tavsiye', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  suggestion?: string | null;
}

export class UpdateFeedbackDto {
  @ApiProperty({ enum: ['new', 'read'] })
  @IsIn(['new', 'read'])
  status!: 'new' | 'read';
}
