import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { S3Service } from 'src/utils/s3.service';
import {
  S3Bucket,
  TypeLabSession,
  TypeNotification,
  TypeTaskNotification,
  SubTypeNotification,
} from 'src/utils/constant';
import { AuthenticatedUser } from 'src/auth';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from 'src/common/dto/pagination.dto';
import {
  errorGeneralFile,
  errorLabSession,
  errorLabTesting,
  errorOCR,
  errorPatient,
  errorPatientFile,
  errorUser,
} from 'src/utils/errorRespones';
import { CreatePatientDto } from './dtos/create-patient-dto.req';
import { UploadPatientFilesDto } from './dtos/upload-patient-files.dto';
import { Patient } from 'src/entities/patient.entity';
import { LabSession } from 'src/entities/lab-session.entity';
import { PatientFile } from 'src/entities/patient-file.entity';
import { User } from 'src/entities/user.entity';
import { GeneralFile } from 'src/entities/general-file.entity';
import { getExtensionFromMimeType } from 'src/utils/convertFileType';
import { NotificationService } from 'src/notification/notification.service';
import { CreateNotificationReqDto } from 'src/notification/dto/create-notification.req.dto';
import { UpdatePatientDto } from './dtos/update-patient-dto.req';
import { AssignLabSessionDto } from './dtos/assign-lab-session.dto.req';

interface UploadedFiles {
  medicalTestRequisition: Express.Multer.File;
  salesInvoice: Express.Multer.File;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(GeneralFile)
    private readonly generalFileRepository: Repository<GeneralFile>,
    private readonly s3Service: S3Service,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(LabSession)
    private readonly labSessionRepository: Repository<LabSession>,
    @InjectRepository(PatientFile)
    private readonly patientFileRepository: Repository<PatientFile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  async test(file: Express.Multer.File) {
    this.logger.log('Starting OCR file processing');
    const timestamp = Date.now();

    // Properly decode UTF-8 filename
    let originalFileName = Buffer.from(file.originalname, 'binary').toString(
      'utf8',
    );
    let originalFileNameWithoutSpace = originalFileName.replace(/\s+/g, '-');

    // Create a safe S3 key
    const s3Key = `${timestamp}_${originalFileNameWithoutSpace}`;

    const s3Url = await this.s3Service.uploadFile(
      S3Bucket.OCR_FILE_TEMP,
      s3Key,
      file.buffer,
      file.mimetype,
    );

    const s3KeyExtract = this.s3Service.extractKeyFromUrl(
      s3Url,
      S3Bucket.OCR_FILE_TEMP,
    );
    const presignedUrl = await this.s3Service.generatePresigned(
      S3Bucket.OCR_FILE_TEMP,
      s3KeyExtract,
      3600,
    );

    const ocrServiceUrl = this.configService
      .get<string>('OCR_SERVICE')
      ?.trim()
      .replace(/^"|"$/g, '');
    if (!ocrServiceUrl) {
      this.logger.warn('OCR_SERVICE not configured, skipping OCR processing');
      return errorOCR.ocrServiceUrlNotFound;
    }

    this.logger.log(`OCR service URL configured: ${ocrServiceUrl}`);
    const ocrEndpoint = `${ocrServiceUrl}/process_document?url=${encodeURIComponent(presignedUrl)}`;
    this.logger.log(`OCR endpoint: ${ocrEndpoint}`);
    const encode = encodeURIComponent(presignedUrl);
    return {
      url: presignedUrl,
      urlEncoded: encode,
      ocrEndpoint: ocrEndpoint,
    };
  }

  async ocrFilePath(file: Express.Multer.File) {
    const timestamp = Date.now();

    // Properly decode UTF-8 filename
    let originalFileName = Buffer.from(file.originalname, 'binary').toString(
      'utf8',
    );
    let originalFileNameWithoutSpace = originalFileName.replace(/\s+/g, '-');

    // Create a safe S3 key
    const s3Key = `${timestamp}_${originalFileNameWithoutSpace}`;

    const s3Url = await this.s3Service.uploadFile(
      S3Bucket.OCR_FILE_TEMP,
      s3Key,
      file.buffer,
      file.mimetype,
    );

    const s3KeyExtract = this.s3Service.extractKeyFromUrl(
      s3Url,
      S3Bucket.OCR_FILE_TEMP,
    );
    const presignedUrl = await this.s3Service.generatePresigned(
      S3Bucket.OCR_FILE_TEMP,
      s3KeyExtract,
      3600,
    );

    const ocrServiceUrl = this.configService
      .get<string>('OCR_SERVICE')
      ?.trim()
      .replace(/^"|"$/g, '');
    if (!ocrServiceUrl) {
      this.logger.warn('OCR_SERVICE not configured, skipping OCR processing');
      return errorOCR.ocrServiceUrlNotFound;
    }

    this.logger.log(`OCR service URL configured: ${ocrServiceUrl}`);
    const ocrEndpoint = `${ocrServiceUrl}/process_document?url=${encodeURIComponent(presignedUrl)}`;
    this.logger.log(`OCR endpoint: ${ocrEndpoint}`);

    let ocrResult: any = null;
    try {
      this.logger.log('Sending request to OCR service');
      const response = await firstValueFrom(this.httpService.post(ocrEndpoint));

      this.logger.log('OCR service responded successfully');
      this.logger.log(`OCR response status: ${response.status}`);
      this.logger.log(`OCR response data: ${JSON.stringify(response.data)}`);

      ocrResult = response.data;
    } catch (error) {
      this.logger.error('Failed to process document with OCR service', error);
      this.logger.error(`OCR service error details: ${error.message}`);

      // Don't throw error, just log it and continue
      ocrResult = {
        error: 'OCR processing failed',
        details: error.message,
      };
    }

    this.logger.log('Medical Test Requisition upload process completed');

    return {
      message: 'Medical Test Requisition uploaded successfully',
      ocrResult: ocrResult,
    };
  }

  async uploadGeneralFiles(
    files: Express.Multer.File[],
    user: AuthenticatedUser,
  ) {
    this.logger.log('Starting General Files upload process');
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now();

        // Properly decode UTF-8 filename
        let originalFileName = Buffer.from(
          file.originalname,
          'binary',
        ).toString('utf8');
        let originalFileNameWithoutSpace = originalFileName.replace(
          /\s+/g,
          '-',
        );

        // Create a safe S3 key
        const s3Key = `${timestamp}_${originalFileNameWithoutSpace}`;

        // Upload to S3
        const s3Url = await this.s3Service.uploadFile(
          S3Bucket.GENERAL_FILES,
          s3Key,
          file.buffer,
          file.mimetype,
        );

        // Create general file record
        const generalFile = this.generalFileRepository.create({
          fileName: originalFileName.split('.').slice(0, -1).join('.'),
          fileType: getExtensionFromMimeType(file.mimetype) || file.mimetype,
          fileSize: file.size,
          filePath: s3Url,
          description: 'General File',
          uploadedBy: user.id,
          uploadedAt: new Date(),
        });

        await this.generalFileRepository.save(generalFile);
        this.logger.log(
          `Uploaded file: ${originalFileName} with ID: ${generalFile.id}`,
        );
      }

      return {
        message: 'General files uploaded successfully',
      };
    } catch (error) {
      this.logger.error('Failed to upload general files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General Files upload process completed');
    }
  }

  async downloadGeneralFile(id: number) {
    this.logger.log('Starting General File download process');
    try {
      const generalFile = await this.generalFileRepository.findOne({
        where: { id },
      });

      if (!generalFile) {
        return errorGeneralFile.generalFileNotFound;
      }
      const s3key = this.s3Service.extractKeyFromUrl(
        generalFile.filePath,
        S3Bucket.GENERAL_FILES,
      );

      const presignedUrl = await this.s3Service.generatePresigned(
        S3Bucket.GENERAL_FILES,
        s3key,
        3600,
      );

      return presignedUrl;
    } catch (error) {
      this.logger.error('Failed to download General File', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General File download process completed');
    }
  }

  async deleteGeneralFile(id: number) {
    this.logger.log('Starting General File delete process');
    try {
      const generalFile = await this.generalFileRepository.findOne({
        where: { id },
      });

      if (!generalFile) {
        return errorGeneralFile.generalFileNotFound;
      }

      const s3key = this.s3Service.extractKeyFromUrl(
        generalFile.filePath,
        S3Bucket.GENERAL_FILES,
      );
      await this.s3Service.deleteFile(S3Bucket.GENERAL_FILES, s3key);
      await this.generalFileRepository.delete(id);

      return { message: 'General File deleted successfully' };
    } catch (error) {
      this.logger.error('Failed to delete General File', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General File delete process completed');
    }
  }

  async getGeneralFileById(id: number) {
    this.logger.log('Starting General File get by ID process');
    try {
      const generalFile = await this.generalFileRepository.findOne({
        where: { id },
        relations: {
          uploader: true,
        },
        select: {
          id: true,
          fileName: true,
          filePath: true,
          fileType: true,
          fileSize: true,
          description: true,
          uploadedBy: true,
          uploadedAt: true,
          uploader: {
            id: true,
            name: true,
            email: true,
            metadata: true,
          },
        },
      });

      if (!generalFile) {
        return errorGeneralFile.generalFileNotFound;
      }

      return generalFile;
    } catch (error) {
      this.logger.error('Failed to get General File by ID', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General File get by ID process completed');
    }
  }

  async getAllGeneralFiles(query: PaginationQueryDto) {
    this.logger.log('Starting General File get all process');
    try {
      const {
        page = 1,
        limit = 100,
        search,
        filter,
        dateFrom,
        dateTo,
        sortBy = 'uploadedAt',
        sortOrder = 'DESC',
      } = query;

      const queryBuilder = this.generalFileRepository
        .createQueryBuilder('generalFile')
        .leftJoinAndSelect('generalFile.uploader', 'uploader')
        .select([
          'generalFile.id',
          'generalFile.fileName',
          'generalFile.filePath',
          'generalFile.description',
          'generalFile.fileType',
          'generalFile.fileSize',
          'generalFile.uploadedBy',
          'generalFile.uploadedAt',
          'uploader.id',
          'uploader.name',
          'uploader.email',
          'uploader.metadata',
        ]);

      // Global search functionality
      if (search) {
        queryBuilder.andWhere(
          '(LOWER(masterFile.fileName) LIKE LOWER(:search) OR LOWER(uploader.email) LIKE LOWER(:search) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.firstName")) LIKE LOWER(:search) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.lastName")) LIKE LOWER(:search))',
          { search: `%${search}%` },
        );
      }

      // Filter functionality
      if (filter && Object.keys(filter).length > 0) {
        if (filter.fileName) {
          queryBuilder.andWhere(
            'LOWER(generalFile.fileName) LIKE LOWER(:fileName)',
            { fileName: `%${filter.fileName}%` },
          );
        }

        if (filter.uploaderName) {
          queryBuilder.andWhere(
            '(LOWER(uploader.email) LIKE LOWER(:uploaderName) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.firstName")) LIKE LOWER(:uploaderName) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.lastName")) LIKE LOWER(:uploaderName))',
            { uploaderName: `%${filter.uploaderName}%` },
          );
        }

        if (filter.uploadedBy) {
          queryBuilder.andWhere('generalFile.uploadedBy = :uploadedBy', {
            uploadedBy: filter.uploadedBy,
          });
        }
      }

      // Date range filtering
      if (dateFrom) {
        queryBuilder.andWhere('generalFile.uploadedAt >= :dateFrom', {
          dateFrom: new Date(dateFrom),
        });
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the entire day
        queryBuilder.andWhere('generalFile.uploadedAt <= :dateTo', {
          dateTo: endDate,
        });
      }

      // Sorting
      const validSortFields = ['id', 'fileName', 'uploadedAt', 'uploadedBy'];
      const sortField = validSortFields.includes(sortBy)
        ? sortBy
        : 'uploadedAt';

      if (sortField === 'uploadedBy') {
        queryBuilder.orderBy('uploader.email', sortOrder);
      } else {
        queryBuilder.orderBy(`generalFile.${sortField}`, sortOrder);
      }

      // Get total count before applying pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      // Execute query
      const generalFiles = await queryBuilder.getMany();

      // Return paginated response
      return new PaginatedResponseDto(
        generalFiles,
        page,
        limit,
        total,
        'General files retrieved successfully',
      );
    } catch (error) {
      this.logger.error('Failed to get all General files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General files get all process completed');
    }
  }

  async createPatient(createPatientDto: CreatePatientDto) {
    this.logger.log('Starting Patient create process');
    try {
      const { fullName, citizenId } = createPatientDto;

      const patient = this.patientRepository.create({
        fullName: fullName.trim(),
        dateOfBirth: new Date('1995-07-05'),
        phone: '081234567890',
        address: 'Jl. Raya No. 123',
        citizenId: citizenId.trim(),
        createdAt: new Date(),
      });
      await this.patientRepository.save(patient);
      return { message: 'Patient created successfully' };
    } catch (error) {
      this.logger.error('Failed to create Patient', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient create process completed');
    }
  }

  async getAllPatients(query: PaginationQueryDto) {
    this.logger.log('Starting Patient get all process');
    try {
      const {
        page = 1,
        limit = 100,
        search,
        dateFrom,
        dateTo,
        sortOrder = 'ASC',
      } = query;

      const queryBuilder = this.patientRepository.createQueryBuilder('patient');

      // Global search functionality - search by citizenId and fullName
      if (search) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        queryBuilder.andWhere(
          '(LOWER(patient.citizenId) LIKE :search OR LOWER(patient.fullName) LIKE :search)',
          { search: searchTerm },
        );
      }

      // Date range filtering
      if (dateFrom) {
        queryBuilder.andWhere('patient.createdAt >= :dateFrom', {
          dateFrom: new Date(dateFrom),
        });
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the entire day
        queryBuilder.andWhere('patient.createdAt <= :dateTo', {
          dateTo: endDate,
        });
      }

      queryBuilder.orderBy(`patient.fullName`, sortOrder);

      const total = await queryBuilder.getCount();
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      const patients = await queryBuilder.getMany();
      return new PaginatedResponseDto(
        patients,
        page,
        limit,
        total,
        'Patients retrieved successfully',
      );
    } catch (error) {
      this.logger.error('Failed to get all Patients', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient get all process completed');
    }
  }

  async updatePatientById(id: number, updatePatientDto: UpdatePatientDto) {
    try {
      this.logger.log('Starting Patient update process');
      const patient = await this.patientRepository.findOne({
        where: { id },
      });

      if (!patient) {
        return errorPatient.patientNotFound;
      }

      if (updatePatientDto.citizenId === patient.citizenId) {
        return errorPatient.citizenIdExists;
      }
      Object.assign(patient, updatePatientDto);

      const updatedPatient = await this.patientRepository.save(patient);

      return {
        message: 'Patient updated successfully',
        patient: updatedPatient,
      };
    } catch (error) {
      this.logger.error('Failed to update Patient', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient update process completed');
    }
  }

  async deletePatientById(id: number) {
    try {
      this.logger.log('Starting Patient delete process');
      const patient = await this.patientRepository.findOne({
        where: { id },
        relations: {
          labSessions: true,
        },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }
      if (patient.labSessions.length > 0) {
        return errorPatient.patientHasLabSession;
      }
      await this.patientRepository.delete(id);
      return { message: 'Patient deleted successfully' };
    } catch (error) {
      this.logger.error('Failed to delete Patient', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient delete process completed');
    }
  }

  async getLabSessionsByPatientId(id: number) {
    this.logger.log('Starting Patient get by ID process');
    try {
      const patient = await this.patientRepository.findOne({
        where: { id },
        relations: {
          labSessions: true,
        },
        select: {
          id: true,
          fullName: true,
          dateOfBirth: true,
          phone: true,
          address: true,
          citizenId: true,
          createdAt: true,
          labSessions: {
            id: true,
          },
        },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }

      const patientData = {
        id: patient.id,
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth,
        phone: patient.phone,
        address: patient.address,
        citizenId: patient.citizenId,
      };
      const labSessions = patient.labSessions.flatMap(
        (labSession) => labSession.id,
      );
      const labSessionData = await this.labSessionRepository.find({
        where: {
          id: In(labSessions),
        },
        relations: {
          doctor: true,
          labTesting: true,
          patientFiles: true,
        },
        select: {
          id: true,
          labcode: true,
          barcode: true,
          typeLabSession: true,
          requestDate: true,
          createdAt: true,
          updatedAt: true,
          finishedAt: true,
          doctor: {
            id: true,
            name: true,
            email: true,
          },
          labTesting: {
            id: true,
            name: true,
            email: true,
          },
          patientFiles: {
            id: true,
            fileName: true,
            filePath: true,
          },
        },
      });
      return { labSessionData, patientData };
    } catch (error) {
      this.logger.error('Failed to get Patient by ID', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient get by ID process completed');
    }
  }

  async getLabSessionById(id: number) {
    this.logger.log('Starting Lab Session get by ID process');
    try {
      const labSession = await this.labSessionRepository.findOne({
        where: { id },
        relations: {
          doctor: true,
          labTesting: true,
          patientFiles: {
            uploader: true,
          },
        },
        select: {
          id: true,
          labcode: true,
          barcode: true,
          typeLabSession: true,
          requestDate: true,
          createdAt: true,
          updatedAt: true,
          finishedAt: true,
          doctor: {
            id: true,
            name: true,
            email: true,
          },
          labTesting: {
            id: true,
            name: true,
            email: true,
          },
          patientFiles: {
            id: true,
            fileName: true,
            filePath: true,
            fileType: true,
            fileSize: true,
            ocrResult: true,
            uploader: {
              id: true,
              email: true,
              name: true,
              metadata: true,
            },
            uploadedAt: true,
          },
        },
      });
      if (!labSession) {
        return errorLabSession.labSessionNotFound;
      }
      return labSession;
    } catch (error) {
      this.logger.error('Failed to get Lab Session by ID', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Lab Session get by ID process completed');
    }
  }

  async downloadPatientFile(sessionId: number, patientFileId: number) {
    this.logger.log('Starting Patient File download process');
    try {
      const patientFile = await this.patientFileRepository.findOne({
        where: { id: patientFileId, sessionId: sessionId },
      });
      if (!patientFile) {
        return errorPatientFile.patientFileNotFound;
      }
      const s3key = this.s3Service.extractKeyFromUrl(
        patientFile.filePath,
        S3Bucket.PATIENT_FILES,
      );
      const fileUrl = await this.s3Service.generatePresigned(
        S3Bucket.PATIENT_FILES,
        s3key,
        3600,
      );
      return fileUrl;
    } catch (error) {
      this.logger.error('Failed to download Patient File', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient File download process completed');
    }
  }

  async deletePatientFile(sessionId: number, patientFileId: number) {
    this.logger.log('Starting Patient File delete process');
    try {
      const patientFile = await this.patientFileRepository.findOne({
        where: { id: patientFileId, sessionId: sessionId },
      });
      if (!patientFile) {
        return errorPatientFile.patientFileNotFound;
      }
      const s3key = this.s3Service.extractKeyFromUrl(
        patientFile.filePath,
        S3Bucket.PATIENT_FILES,
      );
      await this.s3Service.deleteFile(S3Bucket.PATIENT_FILES, s3key);
      await this.patientFileRepository.delete(patientFileId);
      return { message: 'Patient File deleted successfully' };
    } catch (error) {
      this.logger.error('Failed to delete Patient File', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient File delete process completed');
    }
  }

  async uploadPatientFiles(
    files: Express.Multer.File[],
    uploadData: UploadPatientFilesDto,
    user: AuthenticatedUser,
  ) {
    this.logger.log('Starting Patient Files upload process');
    try {
      const { patientId, typeLabSession, ocrResult } = uploadData;
      // Verify patient exists
      const patient = await this.patientRepository.findOne({
        where: { id: patientId },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }
      // Generate unique labcode and barcode if not provided
      const number = String(Math.floor(Math.random() * 999) + 1).padStart(
        3,
        '0',
      );
      const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      const defaultLabcode = `O5${number}${letter}`;
      const defaultBarcode = `${Math.floor(Math.random() * 1000000)}`;

      const labSession = this.labSessionRepository.create({
        patientId,
        labcode: defaultLabcode,
        barcode: defaultBarcode,
        requestDate: new Date(),
        typeLabSession,
        metadata: {},
      });
      await this.labSessionRepository.save(labSession);
      this.logger.log(`Created new lab session with ID: ${labSession.id}`);

      // Upload files and create patient file records
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now();

        // Properly decode UTF-8 filename
        let originalFileName = Buffer.from(
          file.originalname,
          'binary',
        ).toString('utf8');
        let originalFileNameWithoutSpace = originalFileName.replace(
          /\s+/g,
          '-',
        );
        const originalFileNameWithoutDot = originalFileName
          .split('.')
          .slice(0, -1)
          .join('.');

        // Create a safe S3 key without special characters
        const safeFileName = `${timestamp}_${originalFileNameWithoutSpace}`;
        const s3Key = `session-${labSession.id}/${safeFileName}`;

        // Upload to S3
        const s3Url = await this.s3Service.uploadFile(
          S3Bucket.PATIENT_FILES,
          s3Key,
          file.buffer,
          file.mimetype,
        );

        // Find OCR result for this file
        let fileOcrResult: Record<string, any> | {} = {};
        let hasActualOcrData = false;

        if (ocrResult) {
          // Try to match with both original and corrected filename
          const ocrEntry = ocrResult.find(
            (entry) =>
              entry &&
              typeof entry === 'object' &&
              entry[originalFileNameWithoutDot],
          );
          if (ocrEntry) {
            fileOcrResult = ocrEntry[originalFileNameWithoutDot] || {};
            hasActualOcrData =
              fileOcrResult && Object.keys(fileOcrResult).length > 0;
          }
        }

        // Create patient file record
        const patientFile = this.patientFileRepository.create({
          sessionId: labSession.id,
          fileName: originalFileNameWithoutDot,
          filePath: s3Url,
          fileType: getExtensionFromMimeType(file.mimetype) || file.mimetype,
          fileSize: file.size,
          ocrResult: fileOcrResult || {},
          uploadedBy: user.id,
          uploadedAt: new Date(),
        });

        await this.patientFileRepository.save(patientFile);

        this.logger.log(
          `Uploaded file: ${file.originalname} to session ${labSession.id}`,
        );
      }

      return {
        message: 'Patient files uploaded successfully',
      };
    } catch (error) {
      this.logger.error('Failed to upload patient files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient files upload process completed');
    }
  }

  async assignDoctorAndLabTestingLabSession(
    id: number,
    assignLabSessionDto: AssignLabSessionDto,
    user: AuthenticatedUser,
  ) {
    let notificationReq = {
      title: 'Chỉ định xét nghiệm.',
      message: '',
      taskType: TypeTaskNotification.LAB_TASK,
      type: TypeNotification.ACTION,
      subType: SubTypeNotification.ASSIGN,
      labcode: '',
      barcode: '',
      senderId: user.id,
      receiverId: assignLabSessionDto.labTestingId!,
    };
    try {
      this.logger.log('Starting Lab Session update process');
      const { doctorId, labTestingId } = assignLabSessionDto;
      const labSession = await this.labSessionRepository.findOne({
        where: { id },
      });
      if (!labSession) {
        return errorLabSession.labSessionNotFound;
      }
      if (!doctorId) {
        return errorLabSession.doctorIdRequired;
      }
      if (labSession.typeLabSession === TypeLabSession.TEST && !labTestingId) {
        return errorLabSession.labTestingIdRequired;
      }
      Object.assign(labSession, assignLabSessionDto);
      const updatedLabSession =
        await this.labSessionRepository.save(labSession);
      notificationReq.message = `Bạn đã được chỉ định lần khám với mã labcode ${labSession.labcode} và mã barcode ${labSession.barcode}`;
      notificationReq.labcode = labSession.labcode;
      notificationReq.barcode = labSession.barcode;
      this.notificationService.createNotification(notificationReq);
      return {
        message: 'Lab session updated successfully',
        labSession: updatedLabSession,
      };
    } catch (error) {
      this.logger.error('Failed to update lab session', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Lab Session update process completed');
    }
  }

  async getPreSigndR2() {
    // const general = await this.getGeneralFileById(28);
    const s3key = this.s3Service.extractKeyFromUrl(
      'https://d46919b3b31b61ac349836b18c9ac671.r2.cloudflarestorage.com/general-files/1752308785301_phieu_chi_dinh.jpg',
      S3Bucket.GENERAL_FILES,
    );

    const presignedUrl = await this.s3Service.generatePresigned(
      S3Bucket.GENERAL_FILES,
      s3key,
      3600,
    );

    return presignedUrl;
  }
}
