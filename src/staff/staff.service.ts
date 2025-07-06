import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MasterFile } from 'src/entities/master-file.entity';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { S3Service } from 'src/utils/s3.service';
import { S3Bucket, TypeLabSession } from 'src/utils/constant';
import { AuthenticatedUser } from 'src/auth';
import { PaginationQueryDto, PaginatedResponseDto } from 'src/common/dto/pagination.dto';
import { errorLabSession, errorLabTesting, errorMasterFile, errorPatient, errorPatientFile, errorUser } from 'src/utils/errorRespones';
import { CreatePatientDto } from './dtos/create-patient-dto.req';
import { UploadPatientFilesDto } from './dtos/upload-patient-files.dto';
import { Patient } from 'src/entities/patient.entity';
import { LabSession } from 'src/entities/lab-session.entity';
import { PatientFile } from 'src/entities/patient-file.entity';
import { User } from 'src/entities/user.entity';

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
    @InjectRepository(MasterFile)
    private readonly masterFileRepository: Repository<MasterFile>,
    private readonly s3Service: S3Service,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(LabSession)
    private readonly labSessionRepository: Repository<LabSession>,
    @InjectRepository(PatientFile)
    private readonly patientFileRepository: Repository<PatientFile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}


  async handleUploadInfo(files: UploadedFiles) {
    // Use absolute path resolution to avoid path issues
    const configuredStorePath =
      this.configService.get<string>('STORE_PATH') || './uploads';
    const storePath = path.isAbsolute(configuredStorePath)
      ? configuredStorePath
      : path.resolve(process.cwd(), configuredStorePath);

    this.logger.log(`Using storage path: ${storePath}`);

    // Ensure the storage directory exists
    try {
      if (!fs.existsSync(storePath)) {
        this.logger.log('Storage directory does not exist, creating it');
        fs.mkdirSync(storePath, { recursive: true });
        this.logger.log('Storage directory created successfully');
      }

      // Verify directory is writable
      fs.accessSync(storePath, fs.constants.W_OK);
      this.logger.log('Storage directory is writable');
    } catch (error) {
      this.logger.error(
        `Failed to create or access storage directory: ${storePath}`,
        error,
      );
      throw new Error(`Storage directory is not accessible: ${error.message}`);
    }

    // Process Medical Test Requisition file
    const medicalTestRequisitionSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const medicalTestRequisitionExt = path.extname(
      files.medicalTestRequisition.originalname,
    );
    const medicalTestRequisitionFilename = `medical-test-requisition-${medicalTestRequisitionSuffix}${medicalTestRequisitionExt}`;
    const medicalTestRequisitionPath = path.join(
      storePath,
      medicalTestRequisitionFilename,
    );

    try {
      fs.writeFileSync(
        medicalTestRequisitionPath,
        files.medicalTestRequisition.buffer,
      );
      this.logger.log(
        `Medical test requisition file saved: ${medicalTestRequisitionFilename}`,
      );
    } catch (error) {
      this.logger.error('Failed to save medical test requisition file', error);
      throw new Error(
        `Failed to save medical test requisition file: ${error.message}`,
      );
    }

    // Process Sales Invoice file
    const salesInvoiceSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const salesInvoiceExt = path.extname(files.salesInvoice.originalname);
    const salesInvoiceFilename = `sales-invoice-${salesInvoiceSuffix}${salesInvoiceExt}`;
    const salesInvoicePath = path.join(storePath, salesInvoiceFilename);

    try {
      fs.writeFileSync(salesInvoicePath, files.salesInvoice.buffer);
      this.logger.log(`Sales invoice file saved: ${salesInvoiceFilename}`);
    } catch (error) {
      this.logger.error('Failed to save sales invoice file', error);
      throw new Error(`Failed to save sales invoice file: ${error.message}`);
    }

    const savedFiles = {
      medicalTestRequisition: {
        originalName: files.medicalTestRequisition.originalname,
        filename: medicalTestRequisitionFilename,
        path: medicalTestRequisitionPath,
        size: files.medicalTestRequisition.size,
        mimetype: files.medicalTestRequisition.mimetype,
      },
      salesInvoice: {
        originalName: files.salesInvoice.originalname,
        filename: salesInvoiceFilename,
        path: salesInvoicePath,
        size: files.salesInvoice.size,
        mimetype: files.salesInvoice.mimetype,
      },
    };

    return {
      success: true,
      message: 'Files uploaded successfully',
      files: savedFiles,
      storagePath: storePath,
    };
  }

  async handleMedicalTestRequisitionUpload(file: Express.Multer.File) {
    this.logger.log('Starting Medical Test Requisition upload process');

    // Use absolute path resolution to avoid path issues
    const configuredStorePath =
      this.configService.get<string>('STORE_PATH') || './uploads';
    const storePath = path.isAbsolute(configuredStorePath)
      ? configuredStorePath
      : path.resolve(process.cwd(), configuredStorePath);

    this.logger.log(`Using storage path: ${storePath}`);
    this.logger.log(`Current working directory: ${process.cwd()}`);
    this.logger.log(`Configured store path: ${configuredStorePath}`);

    // Validate file input
    if (!file || !file.buffer) {
      this.logger.error('Invalid file: no file or buffer provided');
      throw new Error('Invalid file provided');
    }

    this.logger.log(
      `File details - Name: ${file.originalname}, Size: ${file.size}, Type: ${file.mimetype}`,
    );

    // Ensure the storage directory exists
    try {
      if (!fs.existsSync(storePath)) {
        this.logger.log('Storage directory does not exist, creating it');
        fs.mkdirSync(storePath, { recursive: true });
        this.logger.log('Storage directory created successfully');
      } else {
        this.logger.log('Storage directory already exists');
      }

      // Verify directory is writable
      fs.accessSync(storePath, fs.constants.W_OK);
      this.logger.log('Storage directory is writable');
    } catch (error) {
      this.logger.error(
        `Failed to create or access storage directory: ${storePath}`,
        error,
      );
      throw new Error(`Storage directory is not accessible: ${error.message}`);
    }

    // Process Medical Test Requisition file
    const medicalTestRequisitionSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const medicalTestRequisitionExt = path.extname(file.originalname);
    const medicalTestRequisitionFilename = `medical-test-requisition-${medicalTestRequisitionSuffix}${medicalTestRequisitionExt}`;
    const medicalTestRequisitionPath = path.join(
      storePath,
      medicalTestRequisitionFilename,
    );

    this.logger.log(`Saving file as: ${medicalTestRequisitionFilename}`);
    this.logger.log(`Full file path: ${medicalTestRequisitionPath}`);
    this.logger.log(`File buffer size: ${file.buffer.length} bytes`);

    try {
      fs.writeFileSync(medicalTestRequisitionPath, file.buffer);
      this.logger.log('File saved successfully to storage');

      // Verify file was actually written
      if (fs.existsSync(medicalTestRequisitionPath)) {
        const savedFileStats = fs.statSync(medicalTestRequisitionPath);
        this.logger.log(`File verified - Size: ${savedFileStats.size} bytes`);

        if (savedFileStats.size !== file.buffer.length) {
          this.logger.warn(
            `File size mismatch - Expected: ${file.buffer.length}, Actual: ${savedFileStats.size}`,
          );
        }
      } else {
        this.logger.error(
          'File was not created despite successful write operation',
        );
        throw new Error(
          'File verification failed - file does not exist after write',
        );
      }
    } catch (error) {
      this.logger.error('Failed to save file to storage', error);
      this.logger.error(`Error details: ${error.message}`);
      this.logger.error(`Error code: ${error.code}`);
      throw new Error(`Failed to save file: ${error.message}`);
    }

    const savedFile = {
      originalName: file.originalname,
      filename: medicalTestRequisitionFilename,
      path: medicalTestRequisitionPath,
      size: file.size,
      mimetype: file.mimetype,
    };

    // Send to OCR service
    const ocrServiceUrl = this.configService.get<string>('OCR_SERVICE');
    if (!ocrServiceUrl) {
      this.logger.warn('OCR_SERVICE not configured, skipping OCR processing');
      return {
        success: true,
        message:
          'Medical Test Requisition uploaded successfully (OCR service not configured)',
        file: savedFile,
        storagePath: storePath,
        ocrResult: null,
      };
    }

    this.logger.log(`OCR service URL configured: ${ocrServiceUrl}`);
    const ocrEndpoint = `${ocrServiceUrl}/process_document?path=${encodeURIComponent(medicalTestRequisitionPath)}`;
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
      success: true,
      message: 'Medical Test Requisition uploaded successfully',
      file: savedFile,
      storagePath: storePath,
      ocrResult: ocrResult,
    };
  }

  async uploadMasterFile(file: Express.Multer.File, user: AuthenticatedUser) {
    this.logger.log('Starting Master File upload process');
    try{
      const timestamp = Date.now();

      const fileName = file.originalname.trim().replace(/\s+/g, '-');
      const s3Key = `${timestamp}_${fileName}`;

      const s3Url = await this.s3Service.uploadFile(
        S3Bucket.MASTER_FILES,
        s3Key,
        file.buffer,
        file.mimetype,
      );

      const masterFile = this.masterFileRepository.create({
        fileName: file.originalname,
        filePath: s3Url,
        description: 'Master File',
        uploadedBy: user.id,
        uploadedAt: new Date(),
      });

      await this.masterFileRepository.save(masterFile);

      return {message: 'Master File uploaded successfully'}
    }catch(error){
      this.logger.error('Failed to upload Master File', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Master File upload process completed');
    }
  }

  async downloadMasterFile(id: number) {
    this.logger.log('Starting Master File download process');
    try {
      const masterFile = await this.masterFileRepository.findOne({
        where: { id },
      });
  
      if (!masterFile) {
        return errorMasterFile.masterFileNotFound; 
      }
      const s3key = this.s3Service.extractKeyFromUrl(masterFile.filePath, S3Bucket.MASTER_FILES);
  
      const presignedUrl = await this.s3Service.generatePresigned(
        S3Bucket.MASTER_FILES,
        s3key,
        3600,
      );
  
      return presignedUrl;
    }catch(error){
      this.logger.error('Failed to download Master File', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Master File download process completed');
    }
  }

  async deleteMasterFile(id: number) {
    this.logger.log('Starting Master File delete process');
    try{
      const masterFile = await this.masterFileRepository.findOne({
        where: { id },
      });

      if (!masterFile) {
        return errorMasterFile.masterFileNotFound;
      }

      const s3key = this.s3Service.extractKeyFromUrl(masterFile.filePath, S3Bucket.MASTER_FILES);
      await this.s3Service.deleteFile(S3Bucket.MASTER_FILES, s3key);
      await this.masterFileRepository.delete(id);

      return {message: 'Master File deleted successfully'};
    }catch(error){
      this.logger.error('Failed to delete Master File', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Master File delete process completed');
    }
  }

  async getMasterFileById(id: number) {
    this.logger.log('Starting Master File get by ID process');
    try{
      const masterFile = await this.masterFileRepository.findOne({
        where: { id },
        relations: {
          uploader: true,
        },
        select: {
          id: true,
          fileName: true,
          filePath: true,
          description: true,
          uploadedBy: true,
          uploadedAt: true,
          uploader: {
            id: true,
            email: true,
            metadata: true,
          },
        },
      });

      if (!masterFile) {
        return errorMasterFile.masterFileNotFound;
      }

      return masterFile;
    }catch(error){
      this.logger.error('Failed to get Master File by ID', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Master File get by ID process completed');
    }
  }

  async getAllMasterFiles(query: PaginationQueryDto) {
    this.logger.log('Starting Master File get all process');
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

      const queryBuilder = this.masterFileRepository
        .createQueryBuilder('masterFile')
        .leftJoinAndSelect('masterFile.uploader', 'uploader')
        .select([
          'masterFile.id',
          'masterFile.fileName',
          'masterFile.filePath',
          'masterFile.description',
          'masterFile.uploadedBy',
          'masterFile.uploadedAt',
          'uploader.id',
          'uploader.email',
          'uploader.metadata',
        ]);

      // Global search functionality
      if (search) {
        queryBuilder.andWhere(
          '(LOWER(masterFile.fileName) LIKE LOWER(:search) OR LOWER(uploader.email) LIKE LOWER(:search) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.firstName")) LIKE LOWER(:search) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.lastName")) LIKE LOWER(:search))',
          { search: `%${search}%` }
        );
      }

      // Filter functionality
      if (filter && Object.keys(filter).length > 0) {
        if (filter.fileName) {
          queryBuilder.andWhere(
            'LOWER(masterFile.fileName) LIKE LOWER(:fileName)',
            { fileName: `%${filter.fileName}%` }
          );
        }

        if (filter.uploaderName) {
          queryBuilder.andWhere(
            '(LOWER(uploader.email) LIKE LOWER(:uploaderName) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.firstName")) LIKE LOWER(:uploaderName) OR LOWER(JSON_EXTRACT(uploader.metadata, "$.lastName")) LIKE LOWER(:uploaderName))',
            { uploaderName: `%${filter.uploaderName}%` }
          );
        }

        if (filter.uploadedBy) {
          queryBuilder.andWhere('masterFile.uploadedBy = :uploadedBy', {
            uploadedBy: filter.uploadedBy,
          });
        }
      }

      // Date range filtering
      if (dateFrom) {
        queryBuilder.andWhere('masterFile.uploadedAt >= :dateFrom', {
          dateFrom: new Date(dateFrom),
        });
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Include the entire day
        queryBuilder.andWhere('masterFile.uploadedAt <= :dateTo', {
          dateTo: endDate,
        });
      }

      // Sorting
      const validSortFields = ['id', 'fileName', 'uploadedAt', 'uploadedBy'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'uploadedAt';
      
      if (sortField === 'uploadedBy') {
        queryBuilder.orderBy('uploader.email', sortOrder);
      } else {
        queryBuilder.orderBy(`masterFile.${sortField}`, sortOrder);
      }

      // Get total count before applying pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      // Execute query
      const masterFiles = await queryBuilder.getMany();

      // Return paginated response
      return new PaginatedResponseDto(
        masterFiles,
        page,
        limit,
        total,
        'Master files retrieved successfully'
      );
    } catch (error) {
      this.logger.error('Failed to get all Master Files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Master File get all process completed');
    }
  }

  async createPatient(createPatientDto: CreatePatientDto) {
    this.logger.log('Starting Patient create process');
    try{
      const {fullName, healthInsuranceCode} = createPatientDto;
      
      const personalId = Math.floor(1000000000 + Math.random() * 9000000000).toString();
      const patient = this.patientRepository.create({
        fullName: fullName.trim(),
        dateOfBirth: new Date('1995-07-05'),
        phone: '081234567890',
        address: 'Jl. Raya No. 123',
        personalId,
        healthInsuranceCode: healthInsuranceCode.trim(),
        createdAt: new Date(),
      });
      await this.patientRepository.save(patient);
      return {message: 'Patient created successfully'};
    }catch(error){
      this.logger.error('Failed to create Patient', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Patient create process completed');
    }
  }

  async getAllPatients(query: PaginationQueryDto) {
    this.logger.log('Starting Patient get all process');
    try{
      const {
        page = 1,
        limit = 100,
        search,
        dateFrom,
        dateTo,
        sortOrder = 'ASC',
        searchField = 'fullName', // Default search field
      } = query;

      const queryBuilder = this.patientRepository.createQueryBuilder('patient');

      // Global search functionality - search by the specified field
      if (search) {
        const validSearchFields = ['fullName', 'healthInsuranceCode', 'personalId'];
        const fieldToSearch = validSearchFields.includes(searchField) ? searchField : 'fullName';
        
        queryBuilder.andWhere(
          `LOWER(patient.${fieldToSearch}) LIKE LOWER(:search)`,
          { search: `%${search}%` }
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
      return new PaginatedResponseDto(patients, page, limit, total, 'Patients retrieved successfully'); 
    }catch(error){
      this.logger.error('Failed to get all Patients', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Patient get all process completed');
    }
  }

  async getLabSessionsByPatientId(id: number) {
    this.logger.log('Starting Patient get by ID process');
    try{
      const patient = await this.patientRepository.findOne({
        where: {id},
        relations: {
          labSessions: true,
        },
        select: {
          id: true,
          fullName: true,
          dateOfBirth: true,
          phone: true,
          address: true,
          personalId: true,
          healthInsuranceCode: true,
          createdAt: true,
          labSessions: {
            id: true,
          },
        },
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }
      const labSessions = patient.labSessions.flatMap(labSession => labSession.id);
      const labSessionData = await this.labSessionRepository.find({
        where: {
          id: In(labSessions),
        },
        relations: {
          doctor: true,
          patientFiles: true
        },
        select: {
          id: true,
          labcode: true,
          barcode: true,
          typeLabSession: true,
          requestDate: true,
          createdAt: true,
          doctor: {
            id: true,
            name: true,
            email: true,
          },
          patientFiles: {
            id: true,
            fileName: true,
            filePath: true,
          }
        },
      });
      return labSessionData;
    }catch(error){
      this.logger.error('Failed to get Patient by ID', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Patient get by ID process completed');
    }
  }

  async getLabSessionById(id: number) {
    this.logger.log('Starting Lab Session get by ID process');
    try{
      const labSession = await this.labSessionRepository.findOne({
        where: {id},
        relations: {
          doctor: true,
          patientFiles: true,
        },
        select: {
          id: true,
          labcode: true,
          barcode: true,
          typeLabSession: true,
          requestDate: true,
          createdAt: true,
          doctor: {
            id: true,
            name: true,
            email: true,
          },
          patientFiles: {
            id: true,
            fileName: true,
            filePath: true,
            fileType: true,
            ocrResult: true,
            uploader: {
              id: true,
              email: true,
              name: true,
            },
            uploadedAt: true,
          }
        },
      });
      if (!labSession) {
        return errorLabSession.labSessionNotFound;
      }
      return labSession;
    }catch(error){
      this.logger.error('Failed to get Lab Session by ID', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Lab Session get by ID process completed');
    }
  }

  async downloadPatientFile(sessionId: number, patientFileId: number) {
    this.logger.log('Starting Patient File download process');
    try{
      const patientFile = await this.patientFileRepository.findOne({
        where: {id: patientFileId, sessionId: sessionId},
      });
      if (!patientFile) {
        return errorPatientFile.patientFileNotFound;
      }
      const s3key = this.s3Service.extractKeyFromUrl(patientFile.filePath, S3Bucket.PATIENT_FILES);
      const fileUrl = await this.s3Service.generatePresigned(S3Bucket.PATIENT_FILES, s3key, 3600);
      return fileUrl;
    }catch(error){
      this.logger.error('Failed to download Patient File', error);
      throw new InternalServerErrorException(error.message);
    }finally{
      this.logger.log('Patient File download process completed');
    }
  }

  async uploadPatientFiles(
    files: Express.Multer.File[],
    uploadData: UploadPatientFilesDto,
    user: AuthenticatedUser
  ) {
    this.logger.log('Starting Patient Files upload process');
    try {
      const { patientId, doctorId, typeLabSession, ocrResult, labTestingId} = uploadData;

      // Verify patient exists
      const patient = await this.patientRepository.findOne({
        where: { id: patientId }
      });
      if (!patient) {
        return errorPatient.patientNotFound;
      }

      // Verify doctor exists
      const doctor = await this.userRepository.findOne({
        where: { id: doctorId }
      });
      if (!doctor) {
        return errorUser.userNotFound;
      }

      if (typeLabSession === TypeLabSession.TEST) {
        if (!labTestingId) {
          return errorLabTesting.labTestingIdNotFound;
        }
        const labTesting = await this.userRepository.findOne({
          where: { id: labTestingId }
        });
        if (!labTesting) {
          return errorLabTesting.labTestingNotFound;
        }
      }
        // Generate unique labcode and barcode if not provided
        const number = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
        const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
        const defaultLabcode = `O5${number}${letter}`;
        const defaultBarcode = `${Math.floor(Math.random() * 1000000)}`;

        const labSession = this.labSessionRepository.create({
          patientId,
          labcode: defaultLabcode,
          barcode: defaultBarcode,
          requestDate: new Date(),
          doctorId,
          labTestingId: labTestingId || null,
          typeLabSession,
          metadata: {},
        });
        await this.labSessionRepository.save(labSession);
        this.logger.log(`Created new lab session with ID: ${labSession.id}`);

      // Upload files and create patient file records
      const uploadedFiles: Array<{
        id: number;
        fileName: string;
        fileType: string;
        hasOcrResult: boolean;
      }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const timestamp = Date.now();
        
        // Properly decode UTF-8 filename
        let originalFileName = Buffer.from(file.originalname, 'binary').toString('utf8')
        let originalFileNameWithoutSpace = originalFileName.replace(/\s+/g, '-');
        
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
        
        if (ocrResult && Array.isArray(ocrResult)) {
          // Try to match with both original and corrected filename
          const ocrEntry = ocrResult.find(entry => 
            entry && typeof entry === 'object' && 
            (entry[originalFileName] || entry[file.originalname])
          );
          if (ocrEntry) {
            fileOcrResult = ocrEntry[originalFileName] || ocrEntry[file.originalname];
            hasActualOcrData = fileOcrResult && Object.keys(fileOcrResult).length > 0;
          }
        }

        // Create patient file record
        const patientFile = this.patientFileRepository.create({
          sessionId: labSession.id,
          fileName: originalFileName,
          filePath: s3Url,
          fileType: file.mimetype,
          ocrResult: fileOcrResult || {},
          uploadedBy: user.id,
          uploadedAt: new Date(),
        });

        await this.patientFileRepository.save(patientFile);
        uploadedFiles.push({
          id: patientFile.id,
          fileName: patientFile.fileName,
          fileType: patientFile.fileType,
          hasOcrResult: hasActualOcrData,
        });

        this.logger.log(`Uploaded file: ${file.originalname} to session ${labSession.id}`);
      }

      return {
        message: 'Patient files uploaded successfully',
        sessionId: labSession.id,
        uploadedFiles,
        totalFiles: files.length,
      };

    } catch (error) {
      this.logger.error('Failed to upload patient files', error);
      throw new InternalServerErrorException(error.message);
    } finally {
      this.logger.log('Patient Files upload process completed');
    }
  }
}
