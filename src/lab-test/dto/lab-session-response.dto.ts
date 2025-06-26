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
  status: string;
  redoReason: string;
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

export class LabSessionResponseDto {
  id: number;
  labcode: string;
  barcode: string;
  requestDate: Date;
  createdAt: Date;
  metadata: Record<string, any>;
  patient: PatientResponseDto;
  doctor: DoctorResponseDto;
}

export class LabSessionWithFastqResponseDto extends LabSessionResponseDto {
  latestFastqFile: FastqFileResponseDto | null;
}

export class LabSessionWithAllFastqResponseDto extends LabSessionResponseDto {
  fastqFiles: FastqFileResponseDto[];
}

export class FastqDownloadResponseDto {
  downloadUrl: string;
  expiresIn: number;
  expiresAt: Date;
}
