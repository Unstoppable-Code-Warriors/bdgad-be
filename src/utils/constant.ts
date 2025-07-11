export enum Env {
  PORT = 'PORT',
  OCR_SERVICE = 'OCR_SERVICE',
  STORE_PATH = 'STORE_PATH',
  DB_HOST = 'DB_HOST',
  DB_PORT = 'DB_PORT',
  DB_USER = 'DB_USER',
  DB_PASS = 'DB_PASS',
  DB_NAME = 'DB_NAME',
  AUTH_SERVICE = 'AUTH_SERVICE',
  S3_API = 'S3_API',
  S3_ENDPOINT = 'S3_ENDPOINT',
  S3_ACCESS_KEY_ID = 'S3_ACCESS_KEY_ID',
  S3_SECRET_ACCESS_KEY = 'S3_SECRET_ACCESS_KEY',
}

// S3 Bucket Constants
export enum S3Bucket {
  FASTQ_FILE = 'fastq-file',
  ANALYSIS_RESULTS = 'analysis-results',
  MASTER_FILES = 'master-files',
  GENERAL_FILES = 'general-files',
  PATIENT_FILES = 'patient-files',
}

export enum Role {
  STAFF = 1,
  LAB_TESTING_TECHNICIAN = 2,
  ANALYSIS_TECHNICIAN = 3,
  VALIDATION_TECHNICIAN = 4,
  DOCTOR = 5,
}

export enum TypeLabSession {
  TEST = 'test',
  VALIDATION = 'validation',
}

export enum TypeNotification {
  SYSTEM = 'system',
  LAB_TASK = 'lab_task',
  VALIDATION_TASK = 'validation_task',
  ANALYSIS_TASK = 'analysis_task',
}
