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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  club?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boatClass?: string;

  @ApiPropertyOptional()
  @IsOptional()
  length?: number;

  @ApiPropertyOptional()
  @IsOptional()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  club?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boatClass?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  length?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  width?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string | null;
}
