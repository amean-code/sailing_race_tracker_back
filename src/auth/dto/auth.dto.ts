import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, UserRole } from '../../common/constants';

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
