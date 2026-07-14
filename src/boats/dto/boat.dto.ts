import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBoatDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ default: 'idle' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  raceId?: string;

  @ApiPropertyOptional({ description: 'Sail number e.g. TUR 1234' })
  @IsOptional()
  @IsString()
  sailNumber?: string;

  @ApiPropertyOptional({ description: 'Competitor / captain name' })
  @IsOptional()
  @IsString()
  competitorName?: string;
}

export class UpdateBoatDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  raceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sailNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  competitorName?: string | null;
}
