export class ErrorResponse {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly status: number,
  ) {}

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
    };
  }
}


export const errorMasterFile = {
  masterFileNotFound: new ErrorResponse(
    'MASTER_FILE_NOT_FOUND',
    'Master file not found',
    404,
  )
}

export const errorPatient = {
  patientNotFound: new ErrorResponse(
    'PATIENT_NOT_FOUND',
    'Patient not found',
    404,
  )
}

export const errorLabSession = {
  labSessionNotFound: new ErrorResponse(
    'LAB_SESSION_NOT_FOUND',
    'Lab session not found',
    404,
  )
}