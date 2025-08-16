import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, Not } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFile } from '../entities/fastq-file.entity';
import {
  FastqFilePair,
  FastqFileStatus,
} from '../entities/fastq-file-pair.entity';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
import {
  AnalysisSessionWithLatestResponseDto,
  AnalysisSessionDetailResponseDto,
} from './dto/analysis-response.dto';
import {
  EtlResultQueueDto,
  EtlResultQueueResponseDto,
} from './dto/etl-result-queue.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../auth/types/user.types';
import { S3Service } from '../utils/s3.service';
import {
  S3Bucket,
  TypeNotification,
  TypeTaskNotification,
  SubTypeNotification,
} from '../utils/constant';
import { errorLabSession, errorValidation } from 'src/utils/errorRespones';
import { User } from 'src/entities/user.entity';
import { NotificationService } from 'src/notification/notification.service';
import { CreateNotificationReqDto } from 'src/notification/dto/create-notification.req.dto';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
    @InjectRepository(LabSession)
    private labSessionRepository: Repository<LabSession>,
    @InjectRepository(LabCodeLabSession)
    private labCodeLabSessionRepository: Repository<LabCodeLabSession>,
    @InjectRepository(AssignLabSession)
    private assignLabSessionRepository: Repository<AssignLabSession>,
    @InjectRepository(FastqFilePair)
    private fastqFilePairRepository: Repository<FastqFilePair>,
    @InjectRepository(EtlResult)
    private etlResultRepository: Repository<EtlResult>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private formatLabcodeArray(labcodes: string[] | null | undefined): string {
    if (!labcodes || labcodes.length === 0) {
      return 'unknown';
    }
    return labcodes.join(', ');
  }

  async findAllAnalysisSessions(
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<AnalysisSessionWithLatestResponseDto>> {
    const {
      search,
      filter,
      filterFastq,
      filterEtl,
      sortBy,
      sortOrder,
      page = 1,
      limit = 10,
      dateFrom,
      dateTo,
    } = query;

    // Create query builder to find labcodes where the user is assigned as analysis
    const queryBuilder: SelectQueryBuilder<LabCodeLabSession> =
      this.labCodeLabSessionRepository
        .createQueryBuilder('labcode')
        .leftJoinAndSelect('labcode.labSession', 'labSession')
        .leftJoinAndSelect('labSession.patient', 'patient')
        .leftJoinAndSelect('labcode.assignment', 'assignment')
        .leftJoinAndSelect('assignment.doctor', 'doctor')
        .leftJoinAndSelect('assignment.validation', 'validation')
        .select([
          'labcode.id',
          'labcode.labcode',
          'labcode.createdAt',
          'labSession.id',
          'labSession.patientId',
          'labSession.createdAt',
          'labSession.updatedAt',
          'labSession.typeLabSession',
          'labSession.finishedAt',
          'patient.id',
          'patient.fullName',
          'patient.dateOfBirth',
          'patient.phone',
          'patient.address1',
          'patient.address2',
          'patient.citizenId',
          'patient.barcode',
          'patient.createdAt',
          'assignment.id',
          'assignment.doctorId',
          'assignment.labTestingId',
          'assignment.analysisId',
          'assignment.validationId',
          'assignment.requestDateLabTesting',
          'assignment.requestDateAnalysis',
          'assignment.requestDateValidation',
          'doctor.id',
          'doctor.name',
          'doctor.email',
          'doctor.metadata',
          'validation.id',
          'validation.name',
          'validation.email',
          'validation.metadata',
        ])
        .where('assignment.analysisId = :userId', { userId: user.id })
        .andWhere('labSession.typeLabSession = :type', { type: 'test' })
        // Include labcodes that have FastQ file pairs with specific statuses
        .andWhere(
          'EXISTS (SELECT 1 FROM fastq_file_pairs fp WHERE fp.labcode_lab_session_id = labcode.id AND fp.status IN (:...allowedStatuses))',
          {
            allowedStatuses: [
              FastqFileStatus.WAIT_FOR_APPROVAL,
              FastqFileStatus.REJECTED,
              FastqFileStatus.APPROVED,
            ],
          },
        );

    queryBuilder.orderBy('labcode.createdAt', 'DESC');

    // Apply search functionality (search by labcode and barcode)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(labcode.labcode) LIKE :search OR LOWER(patient.barcode) LIKE :search)',
        { search: searchTerm },
      );
    }

    // Apply date range filtering on assignment request date for analysis
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('assignment.requestDateAnalysis >= :dateFrom', {
        dateFrom: fromDate,
      });
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('assignment.requestDateAnalysis <= :dateTo', {
        dateTo: toDate,
      });
    }

    // Apply filter functionality (filter by ETL status)
    if (filter && filter.etlStatus) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM etl_results er WHERE er.labcode_lab_session_id = labcode.id AND er.status = :etlStatus)',
        { etlStatus: filter.etlStatus },
      );
    }
    //Apply filter functionality (filter by FastQ file pair status)
    if (filter && filter.fastqFilePairStatus) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM fastq_file_pairs fp WHERE fp.labcode_lab_session_id = labcode.id AND fp.status = :fastqFilePairStatus)',
        { fastqFilePairStatus: filter.fastqFilePairStatus },
      );
    }

    // Apply filterFastq functionality (filter by latest FastQ file pair status)
    if (filterFastq) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM fastq_file_pairs fp 
          WHERE fp.labcode_lab_session_id = labcode.id 
          AND fp.id = (
            SELECT MAX(fp2.id) 
            FROM fastq_file_pairs fp2 
            WHERE fp2.labcode_lab_session_id = labcode.id
          )
          AND fp.status = :filterFastqStatus
        )`,
        { filterFastqStatus: filterFastq },
      );
    }

    // Apply filterEtl functionality (filter by latest ETL result status)
    if (filterEtl) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1 FROM etl_results er 
          WHERE er.labcode_lab_session_id = labcode.id 
          AND er.id = (
            SELECT MAX(er2.id) 
            FROM etl_results er2 
            WHERE er2.labcode_lab_session_id = labcode.id
          )
          AND er.status = :filterEtlStatus
        )`,
        { filterEtlStatus: filterEtl },
      );
    }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [labcodes, total] = await queryBuilder.getManyAndCount();

    // For each labcode, get the latest FastQ file pair and ETL result
    const labcodesWithLatest = await Promise.all(
      labcodes.map(async (labcode) => {
        const [latestFastqFilePair, latestEtlResult] = await Promise.all([
          this.fastqFilePairRepository.findOne({
            where: {
              labcodeLabSessionId: labcode.id,
              status: In([
                FastqFileStatus.WAIT_FOR_APPROVAL,
                FastqFileStatus.REJECTED,
                FastqFileStatus.APPROVED,
              ]),
            },
            relations: {
              creator: true,
              rejector: true,
              fastqFileR1: true,
              fastqFileR2: true,
            },
            select: {
              id: true,
              createdAt: true,
              status: true,
              redoReason: true,
              creator: { id: true, name: true, email: true },
              rejector: { id: true, name: true, email: true },
              fastqFileR1: { id: true, filePath: true, createdAt: true },
              fastqFileR2: { id: true, filePath: true, createdAt: true },
            },
            order: { createdAt: 'DESC' },
          }),
          this.etlResultRepository.findOne({
            where: { labcodeLabSessionId: labcode.id },
            relations: { rejector: true, approver: true, fastqPair: true },
            select: {
              id: true,
              fastqFilePairId: true,
              resultPath: true,
              etlCompletedAt: true,
              status: true,
              reasonReject: true,
              reasonApprove: true,
              rejector: { id: true, name: true, email: true },
              approver: { id: true, name: true, email: true },
              fastqPair: { id: true, status: true, createdAt: true },
            },
            order: { etlCompletedAt: 'DESC' },
          }),
        ]);

        // Transform to match expected DTO structure
        return {
          id: labcode.id,
          labcode: [labcode.labcode], // Convert single labcode to array for backward compatibility
          barcode: labcode.labSession.patient.barcode,
          requestDateLabTesting:
            labcode.assignment?.requestDateLabTesting || null,
          requestDateAnalysis: labcode.assignment?.requestDateAnalysis || null,
          requestDateValidation:
            labcode.assignment?.requestDateValidation || null,
          createdAt: labcode.labSession.createdAt,
          metadata: {}, // Empty object for backward compatibility
          patient: labcode.labSession.patient,
          doctor: labcode.assignment?.doctor || null,
          validation: labcode.assignment?.validation || null,
          latestFastqPairFile: latestFastqFilePair,
          latestEtlResult,
        };
      }),
    );

    return new PaginatedResponseDto(labcodesWithLatest, page, limit, total);
  }

  async findAnalysisSessionById(
    id: number,
  ): Promise<AnalysisSessionDetailResponseDto> {
    // Find the specific labcode session by its ID
    const labcodeSession = await this.labCodeLabSessionRepository.findOne({
      where: { id },
      relations: {
        labSession: {
          patient: true,
        },
        assignment: {
          doctor: true,
          validation: true,
        },
        fastqFilePairs: {
          creator: true,
          rejector: true,
          fastqFileR1: true,
          fastqFileR2: true,
        },
        etlResults: {
          rejector: true,
          approver: true,
          fastqPair: true,
        },
      },
      select: {
        id: true,
        labcode: true,
        createdAt: true,
        labSession: {
          id: true,
          patientId: true,
          createdAt: true,
          updatedAt: true,
          typeLabSession: true,
          finishedAt: true,
          patient: {
            id: true,
            fullName: true,
            dateOfBirth: true,
            phone: true,
            address1: true,
            address2: true,
            citizenId: true,
            barcode: true,
            createdAt: true,
          },
        },
        assignment: {
          id: true,
          doctorId: true,
          labTestingId: true,
          analysisId: true,
          validationId: true,
          requestDateLabTesting: true,
          requestDateAnalysis: true,
          requestDateValidation: true,
          doctor: {
            id: true,
            name: true,
            email: true,
            metadata: true,
          },
          validation: {
            id: true,
            name: true,
            email: true,
            metadata: true,
          },
        },
        fastqFilePairs: {
          id: true,
          createdAt: true,
          status: true,
          redoReason: true,
          creator: {
            id: true,
            name: true,
            email: true,
          },
          rejector: {
            id: true,
            name: true,
            email: true,
          },
          fastqFileR1: {
            id: true,
            filePath: true,
            createdAt: true,
          },
          fastqFileR2: {
            id: true,
            filePath: true,
            createdAt: true,
          },
        },
        etlResults: {
          id: true,
          fastqFilePairId: true,
          resultPath: true,
          etlCompletedAt: true,
          status: true,
          reasonReject: true,
          reasonApprove: true,
          rejector: {
            id: true,
            name: true,
            email: true,
          },
          approver: {
            id: true,
            name: true,
            email: true,
          },
          fastqPair: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!labcodeSession) {
      throw new NotFoundException(`Analysis session with ID ${id} not found`);
    }

    const session = labcodeSession.labSession;

    // Get all FastQ file pairs for this specific labcode session and filter by allowed statuses
    const allFastqFilePairs = (labcodeSession.fastqFilePairs || []).filter(
      (filePair) =>
        filePair.status &&
        [
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.REJECTED,
          FastqFileStatus.APPROVED,
        ].includes(filePair.status),
    );

    // Get all ETL results for this specific labcode session
    const allEtlResults = labcodeSession.etlResults || [];

    // Sort FastQ file pairs by createdAt in descending order (newest first)
    allFastqFilePairs.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Sort ETL results by etlCompletedAt in descending order (newest first)
    allEtlResults.sort((a, b) => {
      return (
        new Date(b.etlCompletedAt).getTime() -
        new Date(a.etlCompletedAt).getTime()
      );
    });

    return {
      id: labcodeSession.id,
      labcode: [labcodeSession.labcode], // Array containing this specific labcode
      barcode: session.patient.barcode,
      requestDateAnalysis:
        labcodeSession.assignment?.requestDateAnalysis || null,
      createdAt: session.createdAt,
      metadata: {}, // Empty object for backward compatibility
      patient: session.patient,
      doctor: labcodeSession.assignment?.doctor || null,
      validation: labcodeSession.assignment?.validation || null,
      fastqFilePairs: allFastqFilePairs, // Use the filtered FastQ pairs for this labcode
      etlResults: allEtlResults, // Use the ETL results for this labcode
    };
  }

  async processAnalysis(
    fastqFilePairId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the FastQ file pair
    const fastqFilePair = await this.fastqFilePairRepository.findOne({
      where: {
        id: fastqFilePairId,
        status: In([
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.APPROVED,
        ]),
      },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
        },
        creator: true,
        fastqFileR1: true,
        fastqFileR2: true,
      },
    });

    if (!fastqFilePair) {
      throw new NotFoundException(
        `Approved FastQ file pair with ID ${fastqFilePairId} not found`,
      );
    }

    // update fastq file pair status to APPROVED
    fastqFilePair.status = FastqFileStatus.APPROVED;
    fastqFilePair.approveBy = user.id;
    await this.fastqFilePairRepository.save(fastqFilePair);

    const labcodeSession = fastqFilePair.labcodeLabSession;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    await this.notificationService.createNotification({
      title: `Trạng thái file Fastq pair #${fastqFilePair.id}.`,
      message: `File Fastq pair #${fastqFilePair.id} của lần khám với Barcode ${barcode} đã được duyệt`,
      taskType: TypeTaskNotification.LAB_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.ACCEPT,
      labcode: labcode,
      barcode: barcode,
      senderId: user.id,
      receiverId: fastqFilePair.createdBy,
    });

    // Check if analysis is already in progress for this labcode
    const existingEtl = await this.etlResultRepository.findOne({
      where: {
        labcodeLabSessionId: fastqFilePair.labcodeLabSessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (existingEtl) {
      throw new BadRequestException(
        'Analysis is already in progress for this labcode',
      );
    }

    // Create ETL result entry with pending status
    const etlResult = this.etlResultRepository.create({
      labcodeLabSessionId: fastqFilePair.labcodeLabSessionId,
      fastqFilePairId: fastqFilePair.id,
      resultPath: '',
      etlCompletedAt: new Date(),
    });

    await this.etlResultRepository.save(etlResult);

    // Start real ETL pipeline (async)
    this.runEtlPipeline(
      etlResult,
      labcode,
      barcode,
      user.id,
      fastqFilePair,
    ).catch(async (error) => {
      // Mark as failed if pipeline fails
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.reasonReject = `Processing failed: ${error.message}`;
      await this.etlResultRepository.save(etlResult);
    });
    return {
      message: 'Analysis pipeline started successfully',
    };
  }

  private async runMockEtlPipeline(
    etlResult: EtlResult,
    labcode: string[],
    barcode: string,
    userId: number,
  ): Promise<void> {
    const notificaitonReqs: CreateNotificationReqDto[] = [];

    try {
      // Update status to processing
      etlResult.status = EtlResultStatus.PROCESSING;
      await this.etlResultRepository.save(etlResult);

      // Mock processing delay (simulate ETL pipeline work)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate mock analysis result content using first labcode or 'unknown'
      const primaryLabcode = labcode?.[0] || 'unknown';
      const analysisContent = this.generateMockAnalysisResult(primaryLabcode);

      // Create filename for the result using formatted labcodes
      const formattedLabcodes = this.formatLabcodeArray(labcode);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `analysis-result-${formattedLabcodes.replace(/[, ]/g, '-')}-${timestamp}.txt`;

      // Upload to S3
      const uploadUrl = await this.s3Service.uploadFile(
        S3Bucket.ANALYSIS_RESULTS,
        filename,
        Buffer.from(analysisContent, 'utf-8'),
        'text/plain',
      );

      // Extract key from URL for storage
      const resultPath = this.s3Service.extractKeyFromUrl(
        uploadUrl,
        S3Bucket.ANALYSIS_RESULTS,
      );

      // Update ETL result with success
      etlResult.status = EtlResultStatus.COMPLETED;
      etlResult.resultPath = resultPath;
      etlResult.etlCompletedAt = new Date();
      await this.etlResultRepository.save(etlResult);
      notificaitonReqs.push({
        title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
        message: `Quá trình xử lý file kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} thành công.`,
        taskType: TypeTaskNotification.ANALYSIS_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.ACCEPT,
        labcode: labcode,
        barcode: barcode,
        senderId: userId,
        receiverId: userId,
      });
    } catch (error) {
      // Handle pipeline failure
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.reasonReject = `ETL Pipeline failed: ${error.message}`;
      await this.etlResultRepository.save(etlResult);
      notificaitonReqs.push({
        title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
        message: `Quá trình xử lý file kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} thất bại.`,
        taskType: TypeTaskNotification.ANALYSIS_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.REJECT,
        labcode: labcode,
        barcode: barcode,
        senderId: userId,
        receiverId: userId,
      });
      throw error;
    } finally {
      await this.notificationService.createNotifications({
        notifications: notificaitonReqs,
      });
    }
  }

  private async runEtlPipeline(
    etlResult: EtlResult,
    labcode: string[],
    barcode: string,
    userId: number,
    fastqFilePair: FastqFilePair,
  ): Promise<void> {
    const notificationReqs: CreateNotificationReqDto[] = [];

    try {
      // Update status to processing
      etlResult.status = EtlResultStatus.PROCESSING;
      await this.etlResultRepository.save(etlResult);

      // Validate FastQ files exist
      if (!fastqFilePair.fastqFileR1 || !fastqFilePair.fastqFileR1.filePath) {
        throw new Error('FastQ file R1 is missing or has no file path');
      }
      if (!fastqFilePair.fastqFileR2 || !fastqFilePair.fastqFileR2.filePath) {
        throw new Error('FastQ file R2 is missing or has no file path');
      }

      // Get presigned URLs for FastQ files
      const fastqFileR1Url = await this.s3Service.generatePresigned(
        S3Bucket.FASTQ_FILE,
        this.s3Service.extractKeyFromUrl(
          fastqFilePair.fastqFileR1.filePath,
          S3Bucket.FASTQ_FILE,
        ),
        3600, // 1 hour
      );

      const fastqFileR2Url = await this.s3Service.generatePresigned(
        S3Bucket.FASTQ_FILE,
        this.s3Service.extractKeyFromUrl(
          fastqFilePair.fastqFileR2.filePath,
          S3Bucket.FASTQ_FILE,
        ),
        3600, // 1 hour
      );

      // Call ETL service API
      await this.callEtlAnalyzeApi({
        etlResultId: etlResult.id,
        labcode: labcode[0] || 'unknown',
        barcode: barcode,
        lane: 'L1',
        fastq_1_url: fastqFileR1Url,
        fastq_2_url: fastqFileR2Url,
        genome: 'GATK.GRCh38',
      });

      notificationReqs.push({
        title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
        message: `Quá trình xử lý file kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} đã được gửi đến hệ thống phân tích.`,
        taskType: TypeTaskNotification.ANALYSIS_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.ACCEPT,
        labcode: labcode,
        barcode: barcode,
        senderId: userId,
        receiverId: userId,
      });
    } catch (error) {
      // Handle pipeline failure
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.reasonReject = `ETL Pipeline failed: ${error.message}`;
      await this.etlResultRepository.save(etlResult);
      notificationReqs.push({
        title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
        message: `Quá trình xử lý file kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} thất bại.`,
        taskType: TypeTaskNotification.ANALYSIS_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.REJECT,
        labcode: labcode,
        barcode: barcode,
        senderId: userId,
        receiverId: userId,
      });
      throw error;
    } finally {
      await this.notificationService.createNotifications({
        notifications: notificationReqs,
      });
    }
  }

  private async callEtlAnalyzeApi(payload: {
    etlResultId: number;
    labcode: string;
    barcode: string;
    lane: string;
    fastq_1_url: string;
    fastq_2_url: string;
    genome: string;
  }): Promise<void> {
    const etlServiceUrl = this.configService
      .get<string>('ETL_SERVICE_URL')
      ?.trim()
      .replace(/^"|"$/g, '');

    if (!etlServiceUrl) {
      throw new InternalServerErrorException('ETL_SERVICE_URL not configured');
    }

    const analyzeEndpoint = `${etlServiceUrl}/analyze`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(analyzeEndpoint, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds timeout
        }),
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(
          `ETL API returned status ${response.status}: ${response.statusText}`,
        );
      }

      console.log('ETL Analysis API called successfully:', response.data);
    } catch (error) {
      console.error('Failed to call ETL Analysis API:', error);
      throw new InternalServerErrorException(
        `Failed to call ETL Analysis API: ${error.message}`,
      );
    }
  }

  async processEtlResultFromQueue(
    data: EtlResultQueueDto,
  ): Promise<EtlResultQueueResponseDto> {
    try {
      const { etlResultId, resultS3Url, labcode, barcode, complete_time } =
        data;

      // Find the ETL result by ID
      const etlResult = await this.etlResultRepository.findOne({
        where: { id: etlResultId },
        relations: {
          labcodeLabSession: {
            labSession: {
              patient: true,
            },
          },
        },
      });

      if (!etlResult) {
        throw new NotFoundException(
          `ETL result with ID ${etlResultId} not found`,
        );
      }

      // Update ETL result with completion data
      etlResult.status = EtlResultStatus.COMPLETED;
      etlResult.resultPath = resultS3Url;
      etlResult.etlCompletedAt = new Date();
      etlResult.etlCompletedQueueAt = complete_time;
      await this.etlResultRepository.save(etlResult);

      // Create success notification
      await this.notificationService.createNotification({
        title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
        message: `Quá trình xử lý file kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} thành công.`,
        taskType: TypeTaskNotification.ANALYSIS_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.ACCEPT,
        labcode: [labcode],
        barcode: barcode,
        senderId: 1, // System sender
        receiverId: etlResult.labcodeLabSession?.labSession?.patient?.id || 1,
      });

      return {
        message: `ETL result ${etlResultId} processed successfully`,
        success: true,
      };
    } catch (error) {
      console.error('Failed to process ETL result from queue:', error);
      return {
        message: `Failed to process ETL result: ${error.message}`,
        success: false,
      };
    }
  }

  private generateMockAnalysisResult(labcode: string): string {
    const timestamp = new Date().toISOString();

    return `# Analysis Result Report
## Lab Code: ${labcode}
## Generated: ${timestamp}

### Processing Summary
- Total reads processed: 1,234,567
- Quality score average: 35.2
- GC content: 42.3%
- Sequence length distribution: 150bp (median)

### Variant Analysis
- Total variants identified: 342
- SNPs: 298
- Insertions: 22
- Deletions: 22

### Quality Metrics
- Overall quality: PASS
- Coverage depth: 85.4x (average)
- Contamination level: <0.1%

### Key Findings
1. High-quality sequencing data with excellent coverage
2. No significant contamination detected
3. All quality thresholds met
4. Analysis completed successfully

### Recommendations
- Proceed with clinical interpretation
- Data suitable for downstream analysis
- No resequencing required

---
Analysis completed by automated ETL pipeline
Pipeline version: 2.1.0
Processing time: ${Math.floor(Math.random() * 300 + 60)} seconds
`;
  }

  async downloadEtlResult(etlResultId: number): Promise<string> {
    const etlResult = await this.etlResultRepository.findOne({
      where: {
        id: etlResultId,
        status: Not(In([EtlResultStatus.FAILED, EtlResultStatus.PROCESSING])),
      },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `ETL result with ID ${etlResultId} not found or not available for download`,
      );
    }

    if (!etlResult.resultPath) {
      throw new BadRequestException('ETL result file path not available');
    }

    // Generate presigned URL for download
    const downloadUrl = await this.s3Service.generatePresigned(
      S3Bucket.ANALYSIS_RESULTS,
      etlResult.resultPath,
      3600, // 1 hour expiry
    );

    return downloadUrl;
  }

  async rejectFastq(
    fastqFilePairId: number,
    redoReason: string,
    user: AuthenticatedUser,
  ) {
    // Find the FastQ file pair that's pending approval or approved
    const fastqFilePair = await this.fastqFilePairRepository.findOne({
      where: {
        id: fastqFilePairId,
        status: FastqFileStatus.WAIT_FOR_APPROVAL,
      },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
        },
        creator: true,
      },
    });

    if (!fastqFilePair) {
      throw new NotFoundException(
        `FastQ file pair with ID ${fastqFilePairId} not found or not in wait_for_approval status`,
      );
    }

    // Update FastQ file pair status to rejected with redo reason
    fastqFilePair.status = FastqFileStatus.REJECTED;
    fastqFilePair.redoReason = redoReason;
    fastqFilePair.rejectBy = user.id;

    await this.fastqFilePairRepository.save(fastqFilePair);

    const labcodeSession = fastqFilePair.labcodeLabSession;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    try {
      this.notificationService.createNotification({
        title: `Trạng thái file Fastq pair #${fastqFilePair.id}.`,
        message: `File Fastq pair #${fastqFilePair.id} của lần khám với Barcode ${barcode} đã bị từ chối`,
        taskType: TypeTaskNotification.LAB_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.REJECT,
        labcode: labcode,
        barcode: barcode,
        senderId: user.id,
        receiverId: fastqFilePair.createdBy,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create notification for FastQ file pair rejection: ${error.message}`,
      );
    }

    // If there are any pending or processing ETL results for this labcode, mark them as failed
    const pendingEtlResults = await this.etlResultRepository.find({
      where: {
        labcodeLabSessionId: fastqFilePair.labcodeLabSessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (pendingEtlResults.length > 0) {
      for (const etlResult of pendingEtlResults) {
        etlResult.status = EtlResultStatus.FAILED;
        etlResult.reasonReject = `Analysis cancelled due to FastQ file pair rejection: ${redoReason}`;
        etlResult.rejectBy = user.id;
        await this.etlResultRepository.save(etlResult);
      }
    }

    return {
      message: `FastQ file pair rejected successfully. Reason: ${redoReason}`,
    };
  }

  async sendEtlResultToValidation(
    etlResultId: number,
    user: AuthenticatedUser,
    validationId: number,
  ) {
    // Find the ETL result that's completed or rejected
    const etlResult = await this.etlResultRepository.findOne({
      where: {
        id: etlResultId,
        status: In([EtlResultStatus.COMPLETED, EtlResultStatus.REJECTED]),
      },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
          assignment: true,
        },
      },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `ETL result with ID ${etlResultId} not found or not in completed/rejected status`,
      );
    }

    const labSession = etlResult.labcodeLabSession?.labSession;
    const assignment = etlResult.labcodeLabSession?.assignment;

    if (!labSession || !assignment) {
      return errorLabSession.labSessionNotFound;
    }

    const barcode = labSession.patient.barcode;
    const labcode = [etlResult.labcodeLabSession?.labcode || 'unknown'];

    if (!assignment.validationId && !validationId) {
      return errorValidation.validationIdRequired;
    }

    assignment.validationId = validationId;
    assignment.requestDateValidation = new Date();
    await this.assignLabSessionRepository.save(assignment);
    const formattedLabcodes = this.formatLabcodeArray(labcode);
    await this.notificationService.createNotification({
      title: `Chỉ định thẩm định.`,
      message: `Bạn đã được chỉ định thẩm định lần khám với mã labcode ${formattedLabcodes} và mã barcode ${barcode}`,
      taskType: TypeTaskNotification.VALIDATION_TASK,
      type: TypeNotification.ACTION,
      subType: SubTypeNotification.ASSIGN,
      labcode: labcode,
      barcode: barcode,
      senderId: user.id,
      receiverId: validationId,
    });

    // Update ETL result status to WAIT_FOR_APPROVAL
    etlResult.status = EtlResultStatus.WAIT_FOR_APPROVAL;

    await this.etlResultRepository.save(etlResult);

    return {
      message: 'ETL result sent to validation successfully',
    };
  }

  async retryEtlProcess(
    etlResultId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the ETL result that's failed
    const etlResult = await this.etlResultRepository.findOne({
      where: {
        id: etlResultId,
        status: In([EtlResultStatus.FAILED, EtlResultStatus.REJECTED]),
      },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
        },
        fastqPair: true,
      },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `Failed ETL result with ID ${etlResultId} not found`,
      );
    }

    // Check if there's already another ETL process running for this labcode
    const existingProcessingEtl = await this.etlResultRepository.findOne({
      where: {
        labcodeLabSessionId: etlResult.labcodeLabSessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (existingProcessingEtl) {
      throw new BadRequestException(
        'Another ETL process is already running for this labcode',
      );
    }

    // Find and update the latest FastQ file pair status to APPROVED
    const latestFastqFilePair = await this.fastqFilePairRepository.findOne({
      where: {
        labcodeLabSessionId: etlResult.labcodeLabSessionId,
        status: In([
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.REJECTED,
          FastqFileStatus.APPROVED,
        ]),
      },
      order: { createdAt: 'DESC' },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
        },
        creator: true,
        fastqFileR1: true,
        fastqFileR2: true,
      },
    });

    const barcode = etlResult.labcodeLabSession?.labSession?.patient?.barcode;
    const labcode = [etlResult.labcodeLabSession?.labcode || 'unknown'];

    if (
      latestFastqFilePair &&
      latestFastqFilePair.status !== FastqFileStatus.APPROVED
    ) {
      latestFastqFilePair.status = FastqFileStatus.APPROVED;
      latestFastqFilePair.approveBy = user.id;
      await this.fastqFilePairRepository.save(latestFastqFilePair);
      await this.notificationService
        .createNotification({
          title: `Trạng thái file Fastq pair #${latestFastqFilePair.id}.`,
          message: `File Fastq pair #${latestFastqFilePair.id} của lần khám với Barcode ${barcode} đã được duyệt`,
          taskType: TypeTaskNotification.LAB_TASK,
          type: TypeNotification.PROCESS,
          subType: SubTypeNotification.RETRY,
          labcode: labcode,
          barcode: barcode,
          senderId: user.id,
          receiverId: latestFastqFilePair.createdBy,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            `Failed to create notification for FastQ file pair approval: ${error.message}`,
          );
        });
    }

    // Create a new ETL result for retry instead of updating the existing one
    const newEtlResult = this.etlResultRepository.create({
      labcodeLabSessionId: etlResult.labcodeLabSessionId,
      fastqFilePairId: latestFastqFilePair?.id || etlResult.fastqFilePairId,
      resultPath: '',
      etlCompletedAt: new Date(),
      status: EtlResultStatus.PROCESSING,
    });

    await this.etlResultRepository.save(newEtlResult);

    // Start real ETL pipeline (async) for retry
    if (latestFastqFilePair) {
      this.runEtlPipeline(
        newEtlResult,
        labcode,
        barcode,
        user.id,
        latestFastqFilePair,
      ).catch(async (error) => {
        // Mark as failed if pipeline fails again
        newEtlResult.status = EtlResultStatus.FAILED;
        newEtlResult.reasonReject = `Retry failed: ${error.message}`;
        newEtlResult.rejectBy = user.id;
        await this.etlResultRepository.save(newEtlResult);
      });
    } else {
      // If no FastQ file pair found, mark ETL as failed
      newEtlResult.status = EtlResultStatus.FAILED;
      newEtlResult.reasonReject = 'No FastQ file pair found for retry';
      newEtlResult.rejectBy = user.id;
      await this.etlResultRepository.save(newEtlResult);
      throw new BadRequestException('No FastQ file pair found for retry');
    }

    return {
      message: 'ETL process retry started successfully with new ETL result',
    };
  }
}
