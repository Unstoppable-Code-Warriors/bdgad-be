export class PatientResponseDto {
  id: number;
  fullName: string;
  dateOfBirth: Date | null;
  phone: string;
  address1: string;
  address2: string;
  citizenId: string;
  createdAt: Date;
}

export class DoctorResponseDto {
  id: number;
  name: string;
  email: string;
  metadata: Record<string, any>;
}

export class AnalysisResponseDto {
  id: number;
  name: string;
  email: string;
  metadata: Record<string, any>;
}

export class EtlResultResponseDto {
  id: number;
  fastqFilePairId?: number;
  resultPath: string;
  etlCompletedAt: Date;
  status: string | null;
  reasonReject: string | null;
  reasonApprove: string | null;
  rejector?: {
    id: number;
    name: string;
    email: string;
  } | null;
  approver?: {
    id: number;
    name: string;
    email: string;
  } | null;
  fastqPair?: {
    id: number;
    status: string | null;
    createdAt: Date;
  } | null;
}

export class ValidationSessionResponseDto {
  id: number;
  labcode: string[];
  barcode: string;
  createdAt: Date;
  metadata: Record<string, any>;
  patient: PatientResponseDto;
  doctor: DoctorResponseDto | null;
  analysis?: AnalysisResponseDto | null;
}

export class ValidationSessionWithLatestEtlResponseDto extends ValidationSessionResponseDto {
  latestEtlResult: EtlResultResponseDto | null;
}

export class ValidationSessionDetailResponseDto extends ValidationSessionResponseDto {
  etlResults: EtlResultResponseDto[];
}

export class EtlResultDownloadResponseDto {
  downloadUrl: string;
  expiresIn: number;
  expiresAt: Date;
}
