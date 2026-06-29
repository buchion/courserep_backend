import { IsEnum, IsObject, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LmsType } from '@cr-agentic/shared';

export class ConnectLmsRequestDto {
  @ApiProperty({ enum: LmsType })
  @IsEnum(LmsType)
  lmsType!: LmsType;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  lmsBaseUrl!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReconnectRequestDto {
  @ApiProperty()
  connectedAccountId!: string;
}
