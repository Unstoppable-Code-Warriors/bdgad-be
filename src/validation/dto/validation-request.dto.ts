import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class RejectEtlResultDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class AcceptEtlResultDto {
  @IsOptional()
  @IsString()
  reasonApprove?: string;
}
