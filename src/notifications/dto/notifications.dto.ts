import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NotificationAudienceEnum,
  NotificationEventEnum,
} from '../../common/constants';

export class UpdateIntegrationsDto {
  @IsOptional()
  @IsBoolean()
  smtpEnabled?: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsString()
  smtpFrom?: string;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @IsString()
  evolutionApiUrl?: string;

  @IsOptional()
  @IsString()
  evolutionApiKey?: string;

  @IsOptional()
  @IsString()
  evolutionInstance?: string;
}

export class NotificationRuleDto {
  @IsEnum(NotificationEventEnum)
  event!: NotificationEventEnum;

  @IsEnum(NotificationAudienceEnum)
  audience!: NotificationAudienceEnum;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;

  @IsBoolean()
  whatsappEnabled!: boolean;
}

export class UpdateRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationRuleDto)
  rules!: NotificationRuleDto[];
}

export class TestEmailDto {
  @IsEmail()
  to!: string;
}

export class TestWhatsAppDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  message?: string;
}
