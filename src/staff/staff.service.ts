import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { In, Repository, DataSource } from 'typeorm';
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
  errorLabcode,
  errorLabSession,
  errorOCR,
  errorPatient,
  errorPatientFile,
} from 'src/utils/errorRespones';
import { CreatePatientDto } from './dtos/create-patient-dto.req';
import { UploadPatientFilesDto } from './dtos/upload-patient-files.dto';
import { UploadCategorizedFilesDto } from './dtos/upload-categorized-files.dto';
import { Patient } from 'src/entities/patient.entity';
import { LabSession } from 'src/entities/lab-session.entity';
import { PatientFile } from 'src/entities/patient-file.entity';
import { GeneralFile } from 'src/entities/general-file.entity';
import { CategoryGeneralFile } from 'src/entities/category-general-file.entity';
import { LabCodeLabSession } from 'src/entities/labcode-lab-session.entity';
import { AssignLabSession } from 'src/entities/assign-lab-session.entity';
import { getExtensionFromMimeType } from 'src/utils/convertFileType';
import { NotificationService } from 'src/notification/notification.service';
import { CreateNotificationReqDto } from 'src/notification/dto/create-notification.req.dto';
import { UpdatePatientDto } from './dtos/update-patient-dto.req';
import { AssignLabcodeDto } from './dtos/assign-lab-session.dto.req';
import { CategoryGeneralFileService } from 'src/category-general-file/category-general-file.service';
import { FileValidationService } from './services/file-validation.service';
import {
  GenerateLabcodeRequestDto,
  TestType,
  NIPTPackageType,
  HereditaryCancerPackageType,
  GeneMutationPackageType,
  SampleType,
  GenerateLabcodeResponseDto,
} from './dtos/generate-labcode.dto';
import { generateShortId } from 'src/utils/generateShortId';
import {
  FastqFilePair,
  FastqFileStatus,
} from 'src/entities/fastq-file-pair.entity';
interface UploadedFiles {
  medicalTestRequisition: Express.Multer.File;
  salesInvoice: Express.Multer.File;
}

// Form type options mapping
const formTypeOptions = [
  {
    value: 'hereditary_cancer',
    label:
      'Phiếu đồng thuận thực hiện xét nghiệm tầm soát nguy cơ ung thư di truyền',
  },
  {
    value: 'gene_mutation',
    label: 'Phiếu xét nghiệm đột biến gen',
  },
  {
    value: 'prenatal_screening',
    label:
      'Phiếu đồng thuận thực hiện xét nghiệm sàng lọc tiền sinh không xâm lấn',
  },
];

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly dataSource: DataSource,
    @InjectRepository(GeneralFile)
    private readonly generalFileRepository: Repository<GeneralFile>,
    private readonly s3Service: S3Service,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(LabSession)
    private readonly labSessionRepository: Repository<LabSession>,
    @InjectRepository(LabCodeLabSession)
    private readonly labCodeLabSessionRepository: Repository<LabCodeLabSession>,
    @InjectRepository(AssignLabSession)
    private readonly assignLabSessionRepository: Repository<AssignLabSession>,
    @InjectRepository(PatientFile)
    private readonly patientFileRepository: Repository<PatientFile>,
    @InjectRepository(FastqFilePair)
    private readonly fastqFilePairRepository: Repository<FastqFilePair>,
    @InjectRepository(CategoryGeneralFile)
    private readonly categoryGeneralFileRepository: Repository<CategoryGeneralFile>,
    private readonly notificationService: NotificationService,
    private readonly categoryGeneralFileService: CategoryGeneralFileService,
    private readonly fileValidationService: FileValidationService,
  ) {}

  async test(file: Express.Multer.File) {
    this.logger.log('Starting OCR file processing');
    const shortId = generateShortId();

    // Properly decode UTF-8 filename
    const originalFileName = Buffer.from(file.originalname, 'binary').toString(
      'utf8',
    );
    const originalFileNameWithoutSpace = originalFileName.replace(/\s+/g, '-');

    // Create a safe S3 key
    const s3Key = `${originalFileNameWithoutSpace}_${shortId}`;

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
    const shortId = generateShortId();

    // Properly decode UTF-8 filename
    const originalFileName = Buffer.from(file.originalname, 'binary').toString(
      'utf8',
    );
    const originalFileNameWithoutSpace = originalFileName.replace(/\s+/g, '-');

    // Create a safe S3 key
    const s3Key = `${originalFileNameWithoutSpace}_${shortId}`;

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
    categoryGeneralFileId: number,
    description?: string,
  ) {
    this.logger.log('Starting General Files upload process');
    try {
      await this.categoryGeneralFileService.findOne(categoryGeneralFileId);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const shortId = generateShortId();

        // Properly decode UTF-8 filename
        const originalFileName = Buffer.from(
          file.originalname,
          'binary',
        ).toString('utf8');
        const originalFileNameWithoutSpace = originalFileName.replace(
          /\s+/g,
          '-',
        );

        // Create a safe S3 key
        const s3Key = `${originalFileNameWithoutSpace}_${shortId}`;

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
          description: description || 'General File',
          categoryId: categoryGeneralFileId,
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
          category: true,
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
          category: {
            id: true,
            name: true,
            description: true,
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

  async getAllGeneralFiles(
    query: PaginationQueryDto & { categoryGeneralFileId?: number },
  ) {
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
        categoryGeneralFileId,
      } = query;

      const queryBuilder = this.generalFileRepository
        .createQueryBuilder('generalFile')
        .leftJoinAndSelect('generalFile.uploader', 'uploader')
        .leftJoinAndSelect('generalFile.category', 'category')
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
          'category.id',
          'category.name',
          'category.description',
        ]);

      // Filter by category if provided
      if (categoryGeneralFileId) {
        queryBuilder.andWhere('generalFile.categoryId = :categoryId', {
          categoryId: categoryGeneralFileId,
        });
      }

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

  private async generatePatientBarcode(): Promise<string> {
    // Get current date in YYMMDD format
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    let attempt = 1;

    while (true) {
      try {
        // Count existing patients for today
        const todayCount = await this.patientRepository
          .createQueryBuilder('patient')
          .where('patient.barcode LIKE :prefix', { prefix: `${datePrefix}%` })
          .getCount();

        // Generate barcode with next sequence number
        const sequenceNumber = todayCount + attempt;
        const barcode = `${datePrefix}${sequenceNumber}`;

        // Check if this barcode already exists
        const exists = await this.patientRepository
          .createQueryBuilder('patient')
          .where('patient.barcode = :barcode', { barcode })
          .getOne();

        if (!exists) {
          this.logger.log(
            `Generated unique barcode: ${barcode} on attempt ${attempt}`,
          );
          return barcode;
        }

        this.logger.warn(
          `Barcode ${barcode} already exists, trying next sequence (attempt ${attempt})`,
        );
        attempt++;
      } catch (error) {
        this.logger.error(
          `Error generating barcode on attempt ${attempt}:`,
          error,
        );
        // Continue trying even on error
        attempt++;
      }
    }
  }

  async createPatient(createPatientDto: CreatePatientDto) {
    this.logger.log('Starting Patient create process');
    try {
      const { fullName, citizenId } = createPatientDto;

      // Generate barcode with format YYMMDD + ascending order number
      const barcode = await this.generatePatientBarcode();

      const existingPatient = await this.patientRepository.findOne({
        where: { citizenId: citizenId.trim() },
      });
      if (existingPatient) {
        return errorPatient.citizenIdExists;
      }

      const patient = this.patientRepository.create({
        fullName: fullName.trim(),
        dateOfBirth: new Date('1995-07-05'),
        phone: '081234567890',
        address: 'Jl. Raya No. 123',
        citizenId: citizenId.trim(),
        barcode: barcode,
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
    this.logger.log(`Query parameters: ${JSON.stringify(query)}`);
    try {
      const {
        page = 1,
        limit = 100,
        search,
        dateFrom,
        dateTo,
        sortOrder = 'ASC',
      } = query;

      const queryBuilder = this.patientRepository
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient.labSessions', 'labSession')
        .select([
          'patient.id',
          'patient.fullName',
          'patient.dateOfBirth',
          'patient.phone',
          'patient.address',
          'patient.citizenId',
          'patient.barcode',
          'patient.createdAt',
          'labSession.id',
          'labSession.typeLabSession',
          'labSession.createdAt',
          'labSession.updatedAt',
          'labSession.finishedAt',
        ]);

      // Global search functionality - search by citizenId and fullName
      if (search) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        queryBuilder.andWhere(
          '(LOWER(patient.citizenId) LIKE :search OR LOWER(patient.fullName) LIKE :search)',
          { search: searchTerm },
        );
      }

      // Note: Date filtering will be handled in JavaScript after processing the results
      // This is more reliable than complex SQL subqueries

      // For total count, we need to fetch all matching patients and apply the same filtering logic
      let totalCount: number;
      if (dateFrom || dateTo) {
        // When date filtering is applied, we need to process all patients to get accurate count
        const allPatientsForCount = await this.patientRepository
          .createQueryBuilder('patient')
          .leftJoinAndSelect('patient.labSessions', 'labSession')
          .select(['patient.id', 'labSession.id', 'labSession.createdAt'])
          .andWhere(
            search
              ? '(LOWER(patient.citizenId) LIKE :search OR LOWER(patient.fullName) LIKE :search)'
              : '1=1',
            search ? { search: `%${search.trim().toLowerCase()}%` } : {},
          )
          .getMany();

        // Apply the same filtering logic as below
        const filteredForCount = allPatientsForCount.filter((patient) => {
          const latestLabSession = patient.labSessions?.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0];

          if (!latestLabSession) {
            return false; // Exclude patients without lab sessions when date filtering
          }

          const latestSessionDate = new Date(latestLabSession.createdAt);

          if (dateFrom) {
            const fromDate = new Date(dateFrom);
            if (latestSessionDate < fromDate) {
              return false;
            }
          }

          if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // Include the entire day
            if (latestSessionDate > toDate) {
              return false;
            }
          }

          return true;
        });

        totalCount = filteredForCount.length;
      } else {
        // When no date filtering, we can use the simple count
        const countQueryBuilder =
          this.patientRepository.createQueryBuilder('patient');

        if (search) {
          const searchTerm = `%${search.trim().toLowerCase()}%`;
          countQueryBuilder.andWhere(
            '(LOWER(patient.citizenId) LIKE :search OR LOWER(patient.fullName) LIKE :search)',
            { search: searchTerm },
          );
        }

        totalCount = await countQueryBuilder.getCount();
      }

      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      const patientsWithSessions = await queryBuilder.getMany();

      // Process patients to include only the latest lab session
      let processedPatients = patientsWithSessions.map((patient) => {
        // Sort lab sessions by creation date and get the latest one
        const latestLabSession = patient.labSessions?.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];

        return {
          id: patient.id,
          fullName: patient.fullName,
          dateOfBirth: patient.dateOfBirth,
          phone: patient.phone,
          address: patient.address,
          citizenId: patient.citizenId,
          barcode: patient.barcode,
          createdAt: patient.createdAt,
          latestLabSession: latestLabSession || null,
        };
      });

      // Apply date filtering based on latest lab session
      if (dateFrom || dateTo) {
        processedPatients = processedPatients.filter((patient) => {
          if (!patient.latestLabSession) {
            return false; // Exclude patients without lab sessions when date filtering
          }

          const latestSessionDate = new Date(
            patient.latestLabSession.createdAt,
          );

          if (dateFrom) {
            const fromDate = new Date(dateFrom);
            if (latestSessionDate < fromDate) {
              return false;
            }
          }

          if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // Include the entire day
            if (latestSessionDate > toDate) {
              return false;
            }
          }

          return true;
        });
      }

      // Sort by latest lab session creation date
      const sortedPatients = processedPatients.sort((a, b) => {
        const aDate = a.latestLabSession?.createdAt
          ? new Date(a.latestLabSession.createdAt).getTime()
          : null;
        const bDate = b.latestLabSession?.createdAt
          ? new Date(b.latestLabSession.createdAt).getTime()
          : null;

        // Handle patients without lab sessions or with null createdAt
        if (aDate === null && bDate === null) {
          return 0; // Both have no valid dates, maintain order
        }
        if (aDate === null) {
          return sortOrder === 'DESC' ? 1 : -1; // Put patients without valid dates at bottom for DESC, top for ASC
        }
        if (bDate === null) {
          return sortOrder === 'DESC' ? -1 : 1; // Put patients without valid dates at bottom for DESC, top for ASC
        }

        // Both have valid lab session dates, sort by date
        if (sortOrder === 'DESC') {
          return bDate - aDate;
        } else {
          return aDate - bDate;
        }
      });

      return new PaginatedResponseDto(
        sortedPatients,
        page,
        limit,
        totalCount, // Use the properly calculated total count
        'Patients with latest lab sessions retrieved successfully',
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

      //Check citizenid is exists
      if (
        updatePatientDto.citizenId &&
        updatePatientDto.citizenId !== patient.citizenId
      ) {
        const existingPatient = await this.patientRepository.findOne({
          where: { citizenId: updatePatientDto.citizenId },
        });
        if (existingPatient && existingPatient.id !== id) {
          return errorPatient.citizenIdExists;
        }
      }
      // Update patient
      Object.assign(patient, updatePatientDto);
      await this.patientRepository.save(patient);

      return {
        message: 'Patient updated successfully',
        updatePatientDto: updatePatientDto,
        patient: {
          id: patient.id,
          fullName: patient.fullName,
          dateOfBirth: patient.dateOfBirth,
          phone: patient.phone,
          address: patient.address,
          barcode: patient.barcode,
          citizenId: patient.citizenId,
        },
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
          barcode: true,
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
        barcode: patient.barcode,
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
          patientFiles: true,
          labcodes: {
            assignment: {
              doctor: true,
              labTesting: true,
            },
          },
        },
        select: {
          id: true,
          typeLabSession: true,
          createdAt: true,
          updatedAt: true,
          finishedAt: true,
          labcodes: {
            id: true,
            labcode: true,
            assignment: {
              id: true,
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
            },
          },
          patientFiles: {
            id: true,
            fileName: true,
            filePath: true,
          },
        },
        order: {
          createdAt: 'ASC',
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
          patient: true,
          patientFiles: {
            uploader: true,
          },
          labcodes: {
            assignment: {
              doctor: true,
              labTesting: true,
            },
          },
        },
        select: {
          id: true,
          typeLabSession: true,
          createdAt: true,
          updatedAt: true,
          finishedAt: true,
          patient: {
            id: true,
            fullName: true,
            dateOfBirth: true,
            phone: true,
            address: true,
            citizenId: true,
            barcode: true,
            createdAt: true,
          },
          labcodes: {
            id: true,
            labcode: true,
            assignment: {
              id: true,
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
            },
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
  async updatePatientFiles(
    labSessionId: number,
    files: Express.Multer.File[],
    user?: AuthenticatedUser,
  ) {
    this.logger.log('Starting Patient Files update process');
    try {
      // Verify lab session exists
      const labSession = await this.labSessionRepository.findOne({
        where: { id: labSessionId },
        relations: {
          patient: true,
        },
      });

      if (!labSession) {
        return errorLabSession.labSessionNotFound;
      }

      // Upload new files and create patient file records
      const uploadedFiles: PatientFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const shortId = generateShortId();

        // Properly decode UTF-8 filename
        const originalFileName = Buffer.from(
          file.originalname,
          'binary',
        ).toString('utf8');
        const originalFileNameWithoutSpace = originalFileName.replace(
          /\s+/g,
          '-',
        );
        const originalFileNameWithoutDot = originalFileName
          .split('.')
          .slice(0, -1)
          .join('.');

        // Create a safe S3 key without special characters
        const safeFileName = `${originalFileNameWithoutSpace}_${shortId}`;
        const s3Key = `session-${labSessionId}/${safeFileName}`;

        // Upload to S3
        const s3Url = await this.s3Service.uploadFile(
          S3Bucket.PATIENT_FILES,
          s3Key,
          file.buffer,
          file.mimetype,
        );

        // Create patient file record
        const patientFile = this.patientFileRepository.create({
          sessionId: labSessionId,
          fileName: originalFileNameWithoutDot,
          filePath: s3Url,
          fileType: getExtensionFromMimeType(file.mimetype) || file.mimetype,
          fileSize: file.size,
          ocrResult: {},
          uploadedBy: user?.id || 0, // Use 0 as default if user is not provided
          uploadedAt: new Date(),
        });

        const savedPatientFile =
          await this.patientFileRepository.save(patientFile);
        uploadedFiles.push(savedPatientFile);

        this.logger.log(
          `Uploaded file: ${file.originalname} to session ${labSessionId}`,
        );
      }

      return {
        message: 'Patient files updated successfully',
        uploadedFilesCount: uploadedFiles.length,
        uploadedFiles: uploadedFiles.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          uploadedAt: file.uploadedAt,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to update patient files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient files update process completed');
    }
  }

  async uploadPatientFiles(
    files: Express.Multer.File[],
    uploadData: UploadPatientFilesDto,
    user: AuthenticatedUser,
  ) {
    this.logger.log('Starting Patient Files upload process');
    try {
      const { patientId, typeLabSession, ocrResult, labcode } = uploadData;
      // Verify patient exists
      const patient = await this.patientRepository.findOne({
        where: { id: patientId },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }

      // Use provided labcode array or generate default labcode
      let sessionLabcodes: string[];
      if (labcode && labcode.length > 0) {
        sessionLabcodes = labcode;
        this.logger.log(
          `Using provided labcodes: ${JSON.stringify(sessionLabcodes)}`,
        );
      } else {
        // Generate unique labcode if not provided
        const number = String(Math.floor(Math.random() * 999) + 1).padStart(
          3,
          '0',
        );
        const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
        const defaultLabcode = `O5${number}${letter}`;
        sessionLabcodes = [defaultLabcode];
        this.logger.log(`Generated default labcode: ${defaultLabcode}`);
      }

      // Create the basic lab session without labcodes
      const labSession = this.labSessionRepository.create({
        patientId,
        createdAt: new Date(),
        typeLabSession,
      });
      await this.labSessionRepository.save(labSession);
      this.logger.log(`Created new lab session with ID: ${labSession.id}`);

      // Create individual labcode entries
      const labcodeEntities: LabCodeLabSession[] = [];
      for (const labcode of sessionLabcodes) {
        const labcodeEntity = this.labCodeLabSessionRepository.create({
          labSessionId: labSession.id,
          labcode: labcode,
          createdAt: new Date(),
        });
        labcodeEntities.push(labcodeEntity);
      }
      await this.labCodeLabSessionRepository.save(labcodeEntities);
      this.logger.log(`Created ${labcodeEntities.length} labcode entries`);

      // Create assignment records for each labcode (initially empty)
      const assignments: AssignLabSession[] = [];
      for (const labcodeEntity of labcodeEntities) {
        const assignment = this.assignLabSessionRepository.create({
          labcodeLabSessionId: labcodeEntity.id,
          createdAt: new Date(),
        });
        assignments.push(assignment);
      }
      await this.assignLabSessionRepository.save(assignments);
      this.logger.log(`Created ${assignments.length} assignment records`);

      // Upload files and create patient file records
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const shortId = generateShortId();

        // Properly decode UTF-8 filename
        const originalFileName = Buffer.from(
          file.originalname,
          'binary',
        ).toString('utf8');
        const originalFileNameWithoutSpace = originalFileName.replace(
          /\s+/g,
          '-',
        );
        const originalFileNameWithoutDot = originalFileName
          .split('.')
          .slice(0, -1)
          .join('.');

        // Create a safe S3 key without special characters
        const safeFileName = `${originalFileNameWithoutSpace}_${shortId}`;
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

  /**
   * Upload categorized patient files with enhanced metadata and validation
   */
  /**
   * Upload categorized patient files with enhanced metadata and validation
   */
  async uploadCategorizedPatientFiles(
    files: Express.Multer.File[],
    uploadData: UploadCategorizedFilesDto,
    user: AuthenticatedUser,
  ) {
    this.logger.log('Starting Categorized Patient Files upload process');

    try {
      // Validate the entire upload request
      this.fileValidationService.validateCategorizedUpload(files, uploadData);

      const { patientId, typeLabSession, fileCategories, ocrResults } =
        uploadData;

      // Verify patient exists
      const patient = await this.patientRepository.findOne({
        where: { id: patientId },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }

      // Generate labcodes automatically from OCR results and file categories
      const sessionLabcodes: string[] = [];

      // Extract test types from file categories
      const testTypes = this.extractTestTypesFromCategories(fileCategories);

      if (testTypes.length === 0) {
        this.logger.warn(
          'No test types found in file categories, using default labcode',
        );
        throw new InternalServerErrorException(
          'No test types found in file categories',
        );
      }
      console.log(
        `Extracted test types from categories: ${JSON.stringify(testTypes)}`,
      );

      // Generate labcodes first (before starting transaction)
      for (const testType of testTypes) {
        // Find corresponding OCR result for this test type
        console.log('OCR Results:', ocrResults);

        let ocrData = null;
        let matchingOcrResult: any = null;

        // Look through all OCR results to find one that matches this test type
        if (ocrResults && ocrResults.length > 0) {
          for (const ocrResult of ocrResults) {
            // Check if this OCR result matches the current test type
            const ocrCategory = ocrResult.category;
            const ocrTestType = this.mapCategoryToTestType(ocrCategory);

            if (ocrTestType === testType) {
              // Use ocrData directly
              if (ocrResult.ocrData) {
                ocrData = ocrResult.ocrData;
                matchingOcrResult = ocrResult;
                console.log(`Found ocrData for ${testType}:`, ocrData);
                break;
              }
            }
          }
        }

        if (!matchingOcrResult || !ocrData) {
          this.logger.warn(`No OCR data found for test type ${testType}`);
          const testTypeLabel = this.getTestTypeLabel(testType);
          //vietname text for error message
          throw new InternalServerErrorException(
            `Dữ liệu OCR "${testTypeLabel}" không đúng để tạo mã xét nghiệm labcode`,
          );
        }

        console.log(`Using OCR data for test type ${testType}:`, ocrData);

        // Generate GenerateLabcodeRequestDto based on test type and OCR data
        let labcodeRequest;
        try {
          labcodeRequest = this.buildLabcodeRequest(testType, ocrData);
        } catch (error) {
          this.logger.error(
            `Failed to build labcode request for test type ${testType}:`,
            error,
          );
          throw new InternalServerErrorException(
            `Dữ liệu ocr của ${this.getTestTypeLabel(testType)} không đúng để tạo mã xét nghiệm labcode`,
          );
        }

        if (!labcodeRequest) {
          this.logger.error(
            `buildLabcodeRequest returned null for test type ${testType}`,
          );
          throw new InternalServerErrorException(
            `Dữ liệu ocr của ${this.getTestTypeLabel(testType)} không đúng để tạo mã xét nghiệm labcode`,
          );
        }

        try {
          const labcodeResponse = await this.generateLabcode(labcodeRequest);
          sessionLabcodes.push(labcodeResponse.labcode);
          this.logger.log(
            `Generated labcode: ${labcodeResponse.labcode} for test type: ${testType}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to generate labcode for test type ${testType}:`,
            error,
          );
          throw new InternalServerErrorException(
            `Không thể tạo mã labcode cho loại xét nghiệm ${this.getTestTypeLabel(testType)}`,
          );
        }
      }

      // Ensure we have at least one labcode
      if (sessionLabcodes.length === 0) {
        const number = String(Math.floor(Math.random() * 999) + 1).padStart(
          3,
          '0',
        );
        const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const defaultLabcode = `O5${letter}${number}${letter}`;
        sessionLabcodes.push(defaultLabcode);
        this.logger.log(
          `Generated fallback default labcode: ${defaultLabcode}`,
        );
      }

      this.logger.log(
        `Final session labcodes: ${JSON.stringify(sessionLabcodes)}`,
      );

      // Start database transaction for all database operations
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Create lab session using transaction manager
        const labSession = queryRunner.manager.create(LabSession, {
          patientId,
          createdAt: new Date(),
          typeLabSession,
        });
        await queryRunner.manager.save(labSession);
        this.logger.log(
          `Created new categorized lab session with ID: ${labSession.id}`,
        );

        // Create labcode entries
        const labcodeEntities: LabCodeLabSession[] = [];
        for (const labcodeItem of sessionLabcodes) {
          const labcodeEntity = queryRunner.manager.create(LabCodeLabSession, {
            labSessionId: labSession.id,
            labcode: labcodeItem,
            createdAt: new Date(),
          });
          labcodeEntities.push(labcodeEntity);
        }
        await queryRunner.manager.save(labcodeEntities);
        this.logger.log(`Created ${labcodeEntities.length} labcode entries`);

        // Create assignment records for each labcode (initially empty)
        const assignments: AssignLabSession[] = [];
        for (const labcodeEntity of labcodeEntities) {
          const assignment = queryRunner.manager.create(AssignLabSession, {
            labcodeLabSessionId: labcodeEntity.id,
            createdAt: new Date(),
          });
          assignments.push(assignment);
        }
        await queryRunner.manager.save(assignments);
        this.logger.log(`Created ${assignments.length} assignment records`);

        // Get processing order based on priority
        const processingOrder =
          this.fileValidationService.getProcessingOrder(fileCategories);

        // Upload files in priority order
        const uploadedFiles: Array<{
          id: number;
          fileName: string;
          category: string;
          priority: number;
          fileSize: number;
          s3Url: string;
        }> = [];

        for (const fileIndex of processingOrder) {
          const file = files[fileIndex];
          const category = fileCategories[fileIndex];

          const shortId = generateShortId();
          const originalFileName = Buffer.from(
            file.originalname,
            'binary',
          ).toString('utf8');
          const originalFileNameWithoutSpace = originalFileName.replace(
            /\s+/g,
            '-',
          );
          const originalFileNameWithoutDot = originalFileName
            .split('.')
            .slice(0, -1)
            .join('.');

          // Create enhanced S3 key with category
          const safeFileName = `${originalFileNameWithoutSpace}_${shortId}`;
          const s3Key = `session-${labSession.id}/${category.category}/${safeFileName}`;

          // Upload to S3
          const s3Url = await this.s3Service.uploadFile(
            S3Bucket.PATIENT_FILES,
            s3Key,
            file.buffer,
            file.mimetype,
          );

          // Find corresponding OCR result
          const correspondingOCR = ocrResults?.find(
            (ocr) =>
              ocr.fileIndex === fileIndex && ocr.category === category.category,
          );

          // Create patient file record with enhanced metadata using transaction manager
          const patientFile = queryRunner.manager.create(PatientFile, {
            sessionId: labSession.id,
            fileName: originalFileNameWithoutDot,
            filePath: s3Url,
            fileType: getExtensionFromMimeType(file.mimetype) || file.mimetype,
            fileSize: file.size,
            ocrResult: correspondingOCR?.ocrData || {},
            uploadedBy: user.id,
            uploadedAt: new Date(),
            // Enhanced metadata
            fileCategory: category.category,
            processingPriority: category.priority || 5,
            ocrConfidence: correspondingOCR?.confidence,
          });

          const savedFile = await queryRunner.manager.save(patientFile);
          uploadedFiles.push({
            id: savedFile.id,
            fileName: file.originalname,
            category: category.category,
            priority: category.priority || 5,
            fileSize: file.size,
            s3Url,
          });

          this.logger.log(
            `Uploaded categorized file: ${file.originalname} (${category.category}) to session ${labSession.id}`,
          );
        }

        // Commit the transaction
        await queryRunner.commitTransaction();
        this.logger.log('Transaction committed successfully');

        // Send notification after successful commit
        await this.notificationService.createNotification({
          title: 'Categorized Files Uploaded',
          message: `Uploaded ${uploadedFiles.length} categorized files for patient ID ${patientId}`,
          type: TypeNotification.INFO,
          subType: SubTypeNotification.ACCEPT,
          taskType: TypeTaskNotification.LAB_TASK,
          senderId: user.id,
          receiverId: user.id, // For now, send to same user
          labcode: sessionLabcodes,
        } as CreateNotificationReqDto);

        // Validation summary
        const validationSummary =
          this.fileValidationService.validateMinimumRequirements(
            fileCategories,
          );

        this.logger.log(`Upload completed. ${validationSummary.summary}`);

        return {
          success: true,
          message: 'Categorized patient files uploaded successfully',
          data: {
            sessionId: labSession.id,
            uploadedFilesCount: files.length,
            processingOrder,
            validationSummary,
            uploadedFiles,
            sessionLabcodes,
          },
        };
      } catch (transactionError) {
        // Rollback the transaction on any error
        await queryRunner.rollbackTransaction();
        this.logger.error(
          'Transaction rolled back due to error:',
          transactionError,
        );
        throw new InternalServerErrorException(
          'Database transaction failed and was rolled back',
        );
      } finally {
        // Release the query runner
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error('Failed to upload categorized patient files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Categorized patient files upload process completed');
    }
  }

  async assignDoctorAndLabTestingLabSession(
    id: number,
    assignLabcodeDto: AssignLabcodeDto,
    user: AuthenticatedUser,
  ) {
    try {
      this.logger.log('Starting Lab Session assignment process');
      const { assignment, doctorId } = assignLabcodeDto;

      // Get lab session with labcodes and patient
      const labSession = await this.labSessionRepository.findOne({
        where: { id },
        relations: {
          patient: true,
          labcodes: {
            assignment: true,
          },
        },
      });

      if (!labSession) {
        return errorLabSession.labSessionNotFound;
      }

      const labcodeEntities = labSession.labcodes || [];
      const assignmentResults: Array<{
        labcode: string;
        success: boolean;
        labTestingId?: number;
        error?: string;
      }> = [];

      // Process each assignment in the array
      for (const assignmentItem of assignment) {
        const { labcode, labTestingId } = assignmentItem;

        // Find the corresponding labcode entity
        const labcodeEntity = labcodeEntities.find(
          (lc) => lc.labcode === labcode,
        );

        if (!labcodeEntity) {
          assignmentResults.push({
            labcode,
            success: false,
            error: `Labcode ${labcode} not found in session ${id}`,
          });
          this.logger.warn(`Labcode ${labcode} not found in session ${id}`);
          continue;
        }

        // Validate doctorId is provided
        if (!doctorId) {
          assignmentResults.push({
            labcode,
            success: false,
            error: 'Doctor ID is required',
          });
          continue;
        }

        // Validate labTestingId is provided
        if (!labTestingId) {
          assignmentResults.push({
            labcode,
            success: false,
            error: 'Lab testing ID is required',
          });
          continue;
        }

        try {
          // Update or create assignment for this specific labcode
          let assignmentRecord = labcodeEntity.assignment;

          if (!assignmentRecord) {
            // Create new assignment
            assignmentRecord = this.assignLabSessionRepository.create({
              labcodeLabSessionId: labcodeEntity.id,
              requestDateLabTesting: new Date(),
              createdAt: new Date(),
            });
          }

          // Update the assignment
          assignmentRecord.doctorId = doctorId;
          assignmentRecord.labTestingId = labTestingId;
          assignmentRecord.updatedAt = new Date();
          assignmentRecord.requestDateLabTesting = new Date();

          await this.assignLabSessionRepository.save(assignmentRecord);

          assignmentResults.push({
            labcode,
            success: true,
            labTestingId,
          });

          // Send individual notification for each labcode assignment
          const notificationReq: CreateNotificationReqDto = {
            title: 'Chỉ định xét nghiệm.',
            message: `Bạn đã được chỉ định lần khám với mã labcode ${labcode} và mã barcode ${labSession.patient.barcode}`,
            taskType: TypeTaskNotification.LAB_TASK,
            type: TypeNotification.ACTION,
            subType: SubTypeNotification.ASSIGN,
            labcode: [labcode],
            barcode: labSession.patient.barcode,
            senderId: user.id,
            receiverId: labTestingId,
          };

          await this.notificationService.createNotification(notificationReq);

          this.logger.log(
            `Successfully assigned labcode ${labcode} to lab testing ID ${labTestingId}`,
          );
        } catch (error) {
          this.logger.error(`Failed to assign labcode ${labcode}:`, error);
          assignmentResults.push({
            labcode,
            success: false,
            error: error.message,
          });
        }
      }

      // Calculate summary
      const successCount = assignmentResults.filter((r) => r.success).length;
      const failureCount = assignmentResults.length - successCount;

      this.logger.log(
        `Assignment completed: ${successCount} successful, ${failureCount} failed`,
      );

      return {
        success: failureCount === 0,
        message:
          failureCount === 0
            ? `Successfully assigned ${successCount} labcodes`
            : `Assigned ${successCount} labcodes successfully, ${failureCount} failed`,
        data: {
          sessionId: id,
          totalAssignments: assignmentResults.length,
          successfulAssignments: successCount,
          failedAssignments: failureCount,
          results: assignmentResults,
        },
      };
    } catch (error) {
      this.logger.error('Failed to assign lab session:', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Lab Session assignment process completed');
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

  async sendGeneralFileToEMR(categoryGeneralFileIds: number[]) {
    this.logger.log('Starting General Files send to EMR process');
    try {
      // Validate that we have category IDs
      if (!categoryGeneralFileIds || categoryGeneralFileIds.length === 0) {
        throw new InternalServerErrorException('Category IDs are required');
      }

      // Fetch categories with their general files
      const categoriesWithFiles = await this.categoryGeneralFileRepository.find(
        {
          where: {
            id: In(categoryGeneralFileIds),
          },
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      );

      if (categoriesWithFiles.length === 0) {
        throw new InternalServerErrorException(
          'No categories found with provided IDs',
        );
      }

      // Get all general files for these categories
      const generalFiles = await this.generalFileRepository.find({
        where: {
          categoryId: In(categoryGeneralFileIds),
        },
        relations: {
          category: true,
          uploader: true,
        },
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          filePath: true,
          description: true,
          categoryId: true,
          uploadedBy: true,
          uploadedAt: true,
          sendEmrAt: true,
          category: {
            id: true,
            name: true,
            description: true,
          },
          uploader: {
            id: true,
            name: true,
            email: true,
            metadata: true,
          },
        },
      });

      // Update sendEmrAt for all general files
      const currentDate = new Date();
      await this.generalFileRepository.update(
        { categoryId: In(categoryGeneralFileIds) },
        { sendEmrAt: currentDate },
      );

      // Group files by category
      const result = categoriesWithFiles.map((category) => {
        const categoryFiles = generalFiles.filter(
          (file) => file.categoryId === category.id,
        );

        // Update sendEmrAt in the response objects
        const filesWithUpdatedSendEmrAt = categoryFiles.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          filePath: file.filePath,
          description: file.description,
          categoryId: file.categoryId,
          uploadedBy: file.uploadedBy,
          uploadedAt: file.uploadedAt,
          sendEmrAt: currentDate,
        }));

        return {
          id: category.id,
          name: category.name,
          description: category.description,
          generalFiles: filesWithUpdatedSendEmrAt,
        };
      });

      this.logger.log(
        `Successfully sent ${generalFiles.length} files from ${categoriesWithFiles.length} categories to EMR`,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to send general files to EMR', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('General Files send to EMR process completed');
    }
  }

  // Generates a unique labcode based on test type, package type, and sample type
  async generateLabcode(
    request: GenerateLabcodeRequestDto,
  ): Promise<GenerateLabcodeResponseDto> {
    this.logger.log('Starting labcode generation');

    try {
      const { testType, packageType, sampleType } = request;

      const testCode = this.getTestCode(testType, packageType, sampleType);

      const randomLetter = String.fromCharCode(
        65 + Math.floor(Math.random() * 26),
      );

      const randomNumber = String(Math.floor(Math.random() * 999) + 1).padStart(
        3,
        '0',
      );

      const labcode = `${testCode}${randomLetter}${randomNumber}`;

      this.logger.log(`Generated labcode: ${labcode}`);

      return {
        labcode,
        testCode,
        randomLetter,
        randomNumber,
        message: 'Labcode generated successfully',
      };
    } catch (error) {
      this.logger.error('Failed to generate labcode', error);
      throw new InternalServerErrorException('Failed to generate labcode');
    }
  }

  private getTestCode(
    testType: TestType,
    packageType: string,
    sampleType?: string,
  ): string {
    switch (testType) {
      case TestType.NON_INVASIVE_PRENATAL_TESTING:
        return this.getNIPTTestCode(packageType);

      case TestType.HEREDITARY_CANCER:
        return this.getHereditaryCancerTestCode(packageType);

      case TestType.GENE_MUTATION_TESTING:
        if (!sampleType) {
          throw new BadRequestException(
            'Sample type is required for gene mutation testing',
          );
        }
        return this.getGeneMutationTestCode(packageType, sampleType);

      default:
        throw errorLabcode(`Unknown test type: ${testType}`);
    }
  }

  private getNIPTTestCode(packageType: string): string {
    const niptMapping = {
      [NIPTPackageType.NIPT_CNV]: 'NCNVA',
      [NIPTPackageType.NIPT_24]: 'N24A',
      [NIPTPackageType.NIPT_5]: 'N5A',
      [NIPTPackageType.NIPT_4]: 'N4A',
      [NIPTPackageType.NIPT_3]: 'N3A',
    };

    const testCode = niptMapping[packageType];
    if (!testCode) {
      throw new BadRequestException(
        `Unknown NIPT package type: ${packageType}`,
      );
    }

    return testCode;
  }

  private getHereditaryCancerTestCode(packageType: string): string {
    const hereditaryMapping = {
      [HereditaryCancerPackageType.BREAST_CANCER_BCARE]: 'G2',
      [HereditaryCancerPackageType.FIFTEEN_HEREDITARY_CANCER_TYPES_MORE_CARE]:
        'G15',
      [HereditaryCancerPackageType.TWENTY_HEREDITARY_CANCER_TYPES_VIP_CARE]:
        'G20',
    };

    const testCode = hereditaryMapping[packageType];
    if (!testCode) {
      throw new BadRequestException(
        `Unknown hereditary cancer package type: ${packageType}`,
      );
    }

    return testCode;
  }

  private getGeneMutationTestCode(
    packageType: string,
    sampleType: string,
  ): string {
    if (packageType === GeneMutationPackageType.ONCO81) {
      return this.getOncoTestCode('8', sampleType);
    }

    if (packageType === GeneMutationPackageType.ONCO500) {
      return this.getOncoTestCode('A', sampleType);
    }

    if (packageType === GeneMutationPackageType.LUNG_CANCER) {
      return 'O5';
    }

    const otherCancerTypes = [
      GeneMutationPackageType.OVARIAN_CANCER,
      GeneMutationPackageType.COLORECTAL_CANCER,
      GeneMutationPackageType.PROSTATE_CANCER,
      GeneMutationPackageType.BREAST_CANCER,
      GeneMutationPackageType.CERVICAL_CANCER,
      GeneMutationPackageType.GASTRIC_CANCER,
      GeneMutationPackageType.PANCREATIC_CANCER,
      GeneMutationPackageType.THYROID_CANCER,
      GeneMutationPackageType.GASTROINTESTINAL_STROMAL_TUMOR_GIST,
    ];

    if (otherCancerTypes.includes(packageType as GeneMutationPackageType)) {
      return 'O5';
    }

    throw new BadRequestException(
      `Unknown gene mutation package type: ${packageType}`,
    );
  }

  private getOncoTestCode(oncoType: '8' | 'A', sampleType: string): string {
    const sampleMapping = {
      [SampleType.BLOOD_STL_CTDNA]: 'L',
      [SampleType.PLEURAL_PERITONEAL_FLUID]: 'F',
      [SampleType.BIOPSY_TISSUE_FFPE]: 'P',
    };

    const samplePrefix = sampleMapping[sampleType];
    if (!samplePrefix) {
      throw new BadRequestException(`Unknown sample type: ${sampleType}`);
    }

    return `${samplePrefix}${oncoType}`;
  }

  // Helper method to get test type label from formTypeOptions
  private getTestTypeLabel(testType: string): string {
    const option = formTypeOptions.find((option) => option.value === testType);
    return option ? option.label : testType; // Fallback to testType if not found
  }

  // Helper method to extract test types from file categories
  private extractTestTypesFromCategories(fileCategories: any[]): string[] {
    const testTypes: Set<string> = new Set();

    for (const categoryItem of fileCategories) {
      if (categoryItem.category) {
        // Map category to test type based on your business logic
        if (categoryItem.category === 'gene_mutation') {
          testTypes.add('gene_mutation');
        } else if (categoryItem.category === 'prenatal_screening') {
          testTypes.add('prenatal_screening');
        } else if (categoryItem.category === 'hereditary_cancer') {
          testTypes.add('hereditary_cancer');
        }
      }
    }

    return Array.from(testTypes);
  }

  // Helper method to map OCR category to test type
  private mapCategoryToTestType(category: string): string {
    if (category === 'gene_mutation') {
      return 'gene_mutation';
    } else if (category === 'prenatal_screening') {
      return 'prenatal_screening';
    } else if (category === 'hereditary_cancer') {
      return 'hereditary_cancer';
    }

    // Default fallback
    return 'gene_mutation';
  }

  // Helper method to build GenerateLabcodeRequestDto from test type and OCR data
  private buildLabcodeRequest(
    testType: string,
    ocrData: any,
  ): GenerateLabcodeRequestDto | null {
    try {
      switch (testType) {
        case 'gene_mutation':
          return this.buildGeneMutationRequestFromOCR(ocrData);

        case 'prenatal_screening':
          return this.buildPrenatalScreeningRequestFromOCR(ocrData);

        case 'hereditary_cancer':
          return this.buildHereditaryCancerRequestFromOCR(ocrData);

        default:
          this.logger.warn(`Unknown test type: ${testType}`);
          return null;
      }
    } catch (error) {
      this.logger.error(
        `Error building labcode request for test type ${testType}:`,
        error,
      );
      return null;
    }
  }

  private buildGeneMutationRequestFromOCR(
    ocrData: any,
  ): GenerateLabcodeRequestDto {
    const geneMutationData = ocrData.gene_mutation_testing;
    if (!geneMutationData) {
      throw new BadRequestException(
        'gene_mutation_testing section is required for gene mutation testing',
      );
    }

    const specimenData = geneMutationData.specimen_and_test_information;
    if (!specimenData) {
      throw new BadRequestException(
        'specimen_and_test_information is required for gene mutation testing',
      );
    }

    // Get sample type from specimen_type
    let sampleType: SampleType | undefined;
    const specimenType = specimenData.specimen_type;

    console.log(`Specimen Type`, specimenType);
    if (specimenType) {
      if (specimenType.biopsy_tissue_ffpe === true) {
        sampleType = SampleType.BIOPSY_TISSUE_FFPE;
      } else if (specimenType.blood_stl_ctdna === true) {
        sampleType = SampleType.BLOOD_STL_CTDNA;
      } else if (specimenType.pleural_peritoneal_fluid === true) {
        sampleType = SampleType.PLEURAL_PERITONEAL_FLUID;
      }
    }

    if (!sampleType) {
      throw new BadRequestException(
        'At least one specimen type must be selected for gene mutation testing',
      );
    }

    // Get package type from cancer_type_and_test_panel_please_tick_one
    let packageType: string | undefined;
    const cancerPanel = specimenData.cancer_type_and_test_panel_please_tick_one;
    if (cancerPanel) {
      if (cancerPanel.onco_81?.is_selected === true) {
        packageType = GeneMutationPackageType.ONCO81;
      } else if (cancerPanel.onco_500_plus?.is_selected === true) {
        packageType = GeneMutationPackageType.ONCO500;
      } else if (cancerPanel.lung_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.LUNG_CANCER;
      } else if (cancerPanel.ovarian_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.OVARIAN_CANCER;
      } else if (cancerPanel.colorectal_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.COLORECTAL_CANCER;
      } else if (cancerPanel.prostate_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.PROSTATE_CANCER;
      } else if (cancerPanel.breast_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.BREAST_CANCER;
      } else if (cancerPanel.cervical_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.CERVICAL_CANCER;
      } else if (cancerPanel.gastric_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.GASTRIC_CANCER;
      } else if (cancerPanel.pancreatic_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.PANCREATIC_CANCER;
      } else if (cancerPanel.thyroid_cancer?.is_selected === true) {
        packageType = GeneMutationPackageType.THYROID_CANCER;
      } else if (
        cancerPanel.gastrointestinal_stromal_tumor_gist?.is_selected === true
      ) {
        packageType =
          GeneMutationPackageType.GASTROINTESTINAL_STROMAL_TUMOR_GIST;
      }
    }

    if (!packageType) {
      throw new BadRequestException(
        'At least one cancer type and test panel must be selected for gene mutation testing',
      );
    }

    return {
      testType: TestType.GENE_MUTATION_TESTING,
      packageType,
      sampleType,
    };
  }

  private buildPrenatalScreeningRequestFromOCR(
    ocrData: any,
  ): GenerateLabcodeRequestDto {
    const niptData = ocrData.non_invasive_prenatal_testing;
    if (!niptData) {
      throw new BadRequestException(
        'non_invasive_prenatal_testing section is required for prenatal screening',
      );
    }

    // Get package type from test_options
    let packageType: string | undefined;
    const testOptions = niptData.test_options;
    if (testOptions && Array.isArray(testOptions)) {
      // Find the first selected test option
      const selectedOption = testOptions.find(
        (option) => option.is_selected === true,
      );
      if (selectedOption) {
        packageType = selectedOption.package_name;
      }
    }

    if (!packageType) {
      throw new BadRequestException(
        'At least one test option must be selected for prenatal screening',
      );
    }

    return {
      testType: TestType.NON_INVASIVE_PRENATAL_TESTING,
      packageType,
    };
  }

  private buildHereditaryCancerRequestFromOCR(
    ocrData: any,
  ): GenerateLabcodeRequestDto {
    const hereditaryData = ocrData.hereditary_cancer;
    if (!hereditaryData) {
      throw new BadRequestException(
        'hereditary_cancer section is required for hereditary cancer testing',
      );
    }

    // Get package type from the hereditary cancer options
    let packageType: string | undefined;
    if (hereditaryData.breast_cancer_bcare?.is_selected === true) {
      packageType = HereditaryCancerPackageType.BREAST_CANCER_BCARE;
    } else if (
      hereditaryData['15_hereditary_cancer_types_more_care']?.is_selected ===
      true
    ) {
      packageType =
        HereditaryCancerPackageType.FIFTEEN_HEREDITARY_CANCER_TYPES_MORE_CARE;
    } else if (
      hereditaryData['20_hereditary_cancer_types_vip_care']?.is_selected ===
      true
    ) {
      packageType =
        HereditaryCancerPackageType.TWENTY_HEREDITARY_CANCER_TYPES_VIP_CARE;
    }

    if (!packageType) {
      throw new BadRequestException(
        'At least one hereditary cancer package must be selected',
      );
    }

    return {
      testType: TestType.HEREDITARY_CANCER,
      packageType,
    };
  }
}
