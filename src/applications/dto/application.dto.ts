import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApplicationStatusEnum, PaymentStatusEnum } from '../../common/constants';

const APP_MANAGE_STATUSES = [
  ApplicationStatusEnum.PENDING,
  ApplicationStatusEnum.APPROVED,
  ApplicationStatusEnum.CHECKED_IN,
  ApplicationStatusEnum.WITHDRAWN,
] as const;

const PAYMENT_REVIEW = [PaymentStatusEnum.APPROVED, PaymentStatusEnum.REJECTED];

export class UpdateApplicationDto {
  @ApiPropertyOptional({ enum: APP_MANAGE_STATUSES })
  @IsOptional()
  @IsIn([...APP_MANAGE_STATUSES])
  status?: ApplicationStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Trofe başvurusu onayında zorunlu grup id' })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ description: 'Kapasite doluyken geçici atama' })
  @IsOptional()
  @IsBoolean()
  temporaryGroupAssignment?: boolean;
}

export class BulkUpdateApplicationDto {
  @ApiProperty({ type: [String], description: 'Güncellenecek başvuru ID listesi' })
  @IsArray()
  ids!: string[];

  @ApiProperty({ enum: APP_MANAGE_STATUSES })
  @IsIn([...APP_MANAGE_STATUSES])
  status!: ApplicationStatusEnum;

  @ApiPropertyOptional({ description: 'Trofe başvurularında onay için grup id' })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ description: 'Kapasite doluyken geçici atama' })
  @IsOptional()
  @IsBoolean()
  temporaryGroupAssignment?: boolean;
}

export class ReviewPaymentDto {
  @ApiProperty({ enum: PAYMENT_REVIEW })
  @IsIn(PAYMENT_REVIEW)
  status!: PaymentStatusEnum.APPROVED | PaymentStatusEnum.REJECTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
