import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class PharmacyPatientDataDto {
  @IsObject()
  @IsNotEmpty()
  appointment: {
    id: string;
    date: string;
  };

  @IsObject()
  @IsNotEmpty()
  patient: {
    fullname: string;
    ethnicity?: string;
    marital_status?: string;
    address1?: string;
    address2?: string;
    phone?: string;
    gender?: string;
    nation?: string;
    work_address?: string;
    allergies?: string;
    personal_history?: string;
    family_history?: string;
    citizen_id: string;
    date_of_birth?: string;
  };

  @IsObject()
  @IsNotEmpty()
  medical_record: {
    start_at?: string;
    reason?: string;
    current_status?: string;
    treatment?: string;
    diagnoses?: string;
    lab_test?: Array<{
      test_type?: string;
      test_name?: string;
      machine?: string;
      taken_by?: {
        id: string;
        name: string;
      };
      notes?: string;
      conclusion?: string;
      file_attachments?: Array<{
        filename: string;
        url: string;
        file_type: string;
        file_size: number;
      }>;
    }>;
    prescription?: {
      issuedDate?: string;
      notes?: string;
      medications?: Array<{
        name: string;
        dosage: string;
        route: string;
        frequency: string;
        duration: string;
        instruction: string;
        quantity: number;
      }>;
    };
    doctor?: {
      id: string;
      email: string;
      name: string;
      phone?: string;
      address?: string;
    };
  };
}

export class PharmacyPatientQueryDto {
  @IsString()
  @IsNotEmpty()
  search?: string;
}
