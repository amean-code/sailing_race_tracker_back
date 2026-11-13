import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsArray,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RaceStatusEnum, RaceTypeEnum } from '../../common/constants';

export class CreateRaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boatClass?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @ApiPropertyOptional({ enum: RaceStatusEnum })
  @IsOptional()
  @IsEnum(RaceStatusEnum)
  status?: RaceStatusEnum;

  @ApiPropertyOptional({ enum: RaceTypeEnum, default: RaceTypeEnum.REGATA })
  @IsOptional()
  @IsEnum(RaceTypeEnum)
  type?: RaceTypeEnum;

  @ApiProperty({ description: 'Atanan hakem kullanıcı id' })
  @IsString()
  @MinLength(1)
  assignedCommitteeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  raceState?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  courseSnapshot?: Record<string, unknown>;
}

export class UpdateRaceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boatClass?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @ApiPropertyOptional({ enum: RaceStatusEnum })
  @IsOptional()
  @IsEnum(RaceStatusEnum)
  status?: RaceStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedCommitteeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  raceState?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsObject()
  courseSnapshot?: Record<string, unknown> | null;
}

export class RaceApplicationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  boatName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  sailNumber!: string;

  @ApiProperty({ description: 'Başvuranın mevcut tekne kaydı (zorunlu)' })
  @IsString()
  @MinLength(1)
  boatId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  club?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  crewMembers?: string[];
}

export class RaceActionDto {
  @ApiProperty({ enum: ['finish', 'abandon', 'restart'] })
  @IsString()
  action!: 'finish' | 'abandon' | 'restart';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GroupStartAssignmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  groupId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  groupName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;
}

export class GroupStartConfigDto {
  @ApiProperty()
  @IsBoolean()
  sameCourse!: boolean;

  @ApiProperty()
  @IsBoolean()
  sameStart!: boolean;

  @ApiProperty({ type: [GroupStartAssignmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GroupStartAssignmentDto)
  groups!: GroupStartAssignmentDto[];

  /** When sameCourse=true, the shared course id. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string | null;
}

export class GroupStartActionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  groupId!: string;

  @ApiProperty({ enum: ['start', 'schedule', 'cancel_schedule'] })
  @IsString()
  action!: 'start' | 'schedule' | 'cancel_schedule';

  /** Required when action=schedule: minutes from now (e.g. 5 or 10). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  delayMinutes?: number;

  /** Or absolute ISO schedule time. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;
}
