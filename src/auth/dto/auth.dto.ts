import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, USER_STATUSES, UserRole, UserStatusEnum } from '../../common/constants';

export class RegisterDto {
  @ApiProperty({ example: 'sailor@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalı' })
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: 'SAILOR' })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Şifre gerekli' })
  password!: string;
}

export class InviteRefereeDto {
  @ApiProperty({ example: 'referee@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  email!: string;

  @ApiPropertyOptional({ example: 'Ahmet Yılmaz' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  email!: string;

  @ApiProperty({ example: 'Administrator' })
  @IsString()
  @MinLength(2, { message: 'Ad en az 2 karakter olmalı' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  email?: string;

  @ApiPropertyOptional({ example: 'Administrator' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ad en az 2 karakter olmalı' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class SetupPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalı' })
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: USER_STATUSES })
  @IsEnum(UserStatusEnum)
  status!: UserStatusEnum;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ad en az 2 karakter olmalı' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalı' })
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
