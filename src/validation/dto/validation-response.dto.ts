export class PatientResponseDto {
  id: number;
  fullName: string;
  dateOfBirth: Date;
  phone: string;
  address: string;
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

export class ValidationSessionResponseDto {
  id: number;
  labcode: string[];
  barcode: string;
  requestDate: Date;
  createdAt: Date;
  metadata: Record<string, any>;
  patient: PatientResponseDto;
  doctor: DoctorResponseDto | null;
  analysis?: AnalysisResponseDto | null;
}

export class ValidationSessionWithLatestEtlResponseDto extends ValidationSessionResponseDto {
  latestEtlResult: EtlResultResponseDto | null;
}

export class EtlResultDownloadResponseDto {
  downloadUrl: string;
  expiresIn: number;
  expiresAt: Date;
}
