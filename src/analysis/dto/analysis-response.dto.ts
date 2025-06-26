export class PatientResponseDto {
  id: number;
  fullName: string;
  dateOfBirth: Date;
  phone: string;
  address: string;
  personalId: string;
  healthInsuranceCode: string;
  createdAt: Date;
}

export class DoctorResponseDto {
  id: number;
  name: string;
  email: string;
  metadata: Record<string, any>;
}

export class FastqFileResponseDto {
  id: number;
  filePath: string;
  createdAt: Date;
  status: string | null;
  redoReason: string | null;
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
  resultPath: string;
  etlCompletedAt: Date;
  status: string | null;
  redoReason: string | null;
  comment: string;
  rejector?: {
    id: number;
    name: string;
    email: string;
  };
  commenter?: {
    id: number;
    name: string;
    email: string;
  };
}

export class AnalysisSessionResponseDto {
  id: number;
  labcode: string;
  barcode: string;
  requestDate: Date;
  createdAt: Date;
  metadata: Record<string, any>;
  patient: PatientResponseDto;
  doctor: DoctorResponseDto;
}

export class AnalysisSessionWithLatestResponseDto extends AnalysisSessionResponseDto {
  latestFastqFile: FastqFileResponseDto | null;
  latestEtlResult: EtlResultResponseDto | null;
}

export class AnalysisSessionDetailResponseDto extends AnalysisSessionResponseDto {
  fastqFiles: FastqFileResponseDto[];
  etlResults: EtlResultResponseDto[];
}

export class EtlResultDownloadResponseDto {
  downloadUrl: string;
  expiresIn: number;
  expiresAt: Date;
}
