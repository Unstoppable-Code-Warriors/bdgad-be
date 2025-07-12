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

export const errorOCR = {
  filePathNotFound: new ErrorResponse(
    'FILE_PATH_NOT_FOUND',
    'File path not found',
    404,
  ),
  ocrServiceUrlNotFound: new ErrorResponse(
    'OCR_SERVICE_URL_NOT_FOUND',
    'OCR service URL not found',
    400,
  ),
};

export const errorUserAuthen = {
  invalidCredentials: new ErrorResponse(
    'INVALID_CREDENTIALS',
    'Invalid credentials',
    401,
  ),
  userNotFound: new ErrorResponse('USER_NOT_FOUND', 'User not found', 404),
  permissionDenied: new ErrorResponse(
    'PERMISSION_DENIED',
    'Permission denied',
    403,
  ),
  tokenNotFound: new ErrorResponse(
    'TOKEN_NOT_FOUND',
    'Token not found in header',
    404,
  ),
  invalidToken: new ErrorResponse('INVALID_TOKEN', 'Invalid token', 401),
};

export const errorGeneralFile = {
  generalFileNotFound: new ErrorResponse(
    'GENERAL_FILE_NOT_FOUND',
    'General file not found',
    404,
  ),
};

export const errorPatient = {
  patientNotFound: new ErrorResponse(
    'PATIENT_NOT_FOUND',
    'Patient not found',
    404,
  ),
  patientHasLabSession: new ErrorResponse(
    'PATIENT_HAS_LAB_SESSION',
    'Patient has lab session',
    400,
  ),
};

export const errorLabSession = {
  labSessionNotFound: new ErrorResponse(
    'LAB_SESSION_NOT_FOUND',
    'Lab session not found',
    404,
  ),
  doctorIdRequired: new ErrorResponse(
    'DOCTOR_ID_REQUIRED',
    'Doctor id required',
    400,
  ),
  labTestingIdRequired: new ErrorResponse(
    'LAB_TESTING_ID_REQUIRED',
    'Lab testing id required',
    400,
  ),
};

export const errorPatientFile = {
  patientFileNotFound: new ErrorResponse(
    'PATIENT_FILE_NOT_FOUND',
    'Patient file not found',
    404,
  ),
};

export const errorUser = {
  userNotFound: new ErrorResponse('USER_NOT_FOUND', 'User not found', 404),
};

export const errorLabTesting = {
  labTestingIdNotFound: new ErrorResponse(
    'LAB_TESTING_ID_NOT_FOUND',
    'Lab testing id not found',
    400,
  ),
  labTestingNotFound: new ErrorResponse(
    'LAB_TESTING_NOT_FOUND',
    'Lab testing not found',
    404,
  ),
};

export const errorUploadFile = {
  fileNotFound: new ErrorResponse('FILE_NOT_FOUND', 'File not found', 404),
  fileSizeExceeded: new ErrorResponse(
    'FILE_SIZE_EXCEEDED',
    'File size exceeded',
    413,
  ),
  fileTypeNotAllowed: new ErrorResponse(
    'FILE_TYPE_NOT_ALLOWED',
    'File type not allowed',
    400,
  ),
};
