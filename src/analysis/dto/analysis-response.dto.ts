export class PatientResponseDto {
  id: number;
  fullName: string;
  dateOfBirth: Date | null;
  phone: string;
  address1: string;
  address2: string;
  citizenId: string;
  barcode: string;
  createdAt: Date;
}

export class DoctorResponseDto {
  id: number;
  name: string;
  email: string;
  metadata: Record<string, any>;
}

export class ValidationResponseDto {
  id: number;
  name: string;
  email: string;
  metadata: Record<string, any>;
}

export class FastqFileResponseDto {
  id: number;
  filePath: string;
  createdAt: Date;
}

export class FastqFilePairResponseDto {
  id: number;
  createdAt: Date;
  status: string | null;
  redoReason: string | null;
  fastqFileR1: FastqFileResponseDto;
  fastqFileR2: FastqFileResponseDto;
  creator: {
    id: number;
    name: string;
    email: string;
  };
  rejector?: {
    id: number;
    name: string;
    email: string;
  };
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

export class AnalysisSessionResponseDto {
  id: number;
  labcode: string[];
  barcode: string;
  requestDateAnalysis: Date | null;
  createdAt: Date;
  metadata: Record<string, any>;
  patient: PatientResponseDto;
  doctor: DoctorResponseDto | null;
  validation?: ValidationResponseDto | null;
}

export class AnalysisSessionWithLatestResponseDto extends AnalysisSessionResponseDto {
  latestFastqPairFile: FastqFilePairResponseDto | null;
  latestEtlResult: EtlResultResponseDto | null;
}

export class AnalysisSessionDetailResponseDto extends AnalysisSessionResponseDto {
  fastqFilePairs: FastqFilePairResponseDto[];
  etlResults: EtlResultResponseDto[];
}

export class EtlResultDownloadResponseDto {
  downloadUrl: string;
  expiresIn: number;
  expiresAt: Date;
}
