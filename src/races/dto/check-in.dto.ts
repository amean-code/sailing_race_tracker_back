import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CheckInDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  applicationId!: string;
}
