import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SignalFlagDefinitionDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color!: string;

  @IsOptional()
  @IsString()
  descriptionTr?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;
}

export class SequenceOptionDefinitionDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  labelTr!: string;

  @IsString()
  @MinLength(1)
  labelEn!: string;
}

export class UpdateSignalFlagCatalogDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignalFlagDefinitionDto)
  classFlags!: SignalFlagDefinitionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignalFlagDefinitionDto)
  generalFlags!: SignalFlagDefinitionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignalFlagDefinitionDto)
  preparatoryFlags!: SignalFlagDefinitionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SequenceOptionDefinitionDto)
  sequenceOptions!: SequenceOptionDefinitionDto[];
}
