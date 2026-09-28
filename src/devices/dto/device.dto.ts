import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DeviceStatusEnum } from '../../common/constants';

export class CreateDeviceDto {
  @ApiProperty({ example: 'T-Beam Port Side' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'tbeam-axp2101-001' })
  @IsString()
  @MinLength(1)
  hardwareId!: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: DeviceStatusEnum })
  @IsOptional()
  @IsIn([DeviceStatusEnum.ACTIVE, DeviceStatusEnum.DISABLED])
  status?: DeviceStatusEnum;
}

export class AssignDeviceDto {
  @ApiProperty({ description: 'Boat to assign this device to' })
  @IsString()
  @MinLength(1)
  boatId!: string;
}

export class DeviceLocationDto {
  @ApiProperty({ example: 37.034 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 27.369 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: 'Speed in m/s or knots as provided by GPS; must be >= 0' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({ description: 'Heading degrees [0, 360)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(359.999)
  heading?: number;

  @ApiPropertyOptional({
    description:
      'Horizontal accuracy in metres (Geolocation-style). Do NOT send NEO-6M HDOP here — HDOP is not metres.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp of the GPS fix. Must not be more than 5 minutes in the future.',
  })
  @IsOptional()
  @IsISO8601()
  timestamp?: string;
}
