import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ApplicationStatusEnum } from '../../common/constants';

const STATUSES = Object.values(ApplicationStatusEnum);

export class UpdateApplicationDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: ApplicationStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class BulkUpdateApplicationDto {
  @ApiProperty({ type: [String], description: 'Güncellenecek başvuru ID listesi' })
  @IsArray()
  ids!: string[];

  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: ApplicationStatusEnum;
}
