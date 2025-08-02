import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, Not } from 'typeorm';
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
import e from 'express';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly configService: ConfigService,
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
        .leftJoinAndSelect('labSession.assignment', 'assignment')
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
          'patient.address',
          'patient.citizenId',
          'patient.barcode',
          'patient.createdAt',
          'assignment.id',
          'assignment.doctorId',
          'assignment.labTestingId',
          'assignment.analysisId',
          'assignment.validationId',
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

    // Apply date range filtering on labcode creation date
    if (dateFrom) {
      queryBuilder.andWhere('labcode.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      queryBuilder.andWhere('labcode.createdAt <= :dateTo', {
        dateTo: new Date(dateTo),
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
            relations: { rejector: true, commenter: true },
            select: {
              id: true,
              resultPath: true,
              etlCompletedAt: true,
              status: true,
              redoReason: true,
              comment: true,
              rejector: { id: true, name: true, email: true },
              commenter: { id: true, name: true, email: true },
            },
            order: { etlCompletedAt: 'DESC' },
          }),
        ]);

        // Transform to match expected DTO structure
        return {
          id: labcode.id,
          labcode: [labcode.labcode], // Convert single labcode to array for backward compatibility
          barcode: labcode.labSession.patient.barcode,
          requestDate: labcode.createdAt, // Use labcode creation date as request date
          createdAt: labcode.labSession.createdAt,
          metadata: {}, // Empty object for backward compatibility
          patient: labcode.labSession.patient,
          doctor: labcode.labSession.assignment?.doctor || null,
          validation: labcode.labSession.assignment?.validation || null,
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
          assignment: {
            doctor: true,
            validation: true,
          },
        },
        fastqFilePairs: {
          creator: true,
          rejector: true,
          fastqFileR1: true,
          fastqFileR2: true,
        },
        etlResults: {
          rejector: true,
          commenter: true,
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
            address: true,
            citizenId: true,
            barcode: true,
            createdAt: true,
          },
          assignment: {
            id: true,
            doctorId: true,
            labTestingId: true,
            analysisId: true,
            validationId: true,
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
          resultPath: true,
          etlCompletedAt: true,
          status: true,
          redoReason: true,
          comment: true,
          rejector: {
            id: true,
            name: true,
            email: true,
          },
          commenter: {
            id: true,
            name: true,
            email: true,
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
      requestDate: labcodeSession.createdAt, // Use this labcode creation date as request date
      createdAt: session.createdAt,
      metadata: {}, // Empty object for backward compatibility
      patient: session.patient,
      doctor: session.assignment?.doctor || null,
      validation: session.assignment?.validation || null,
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
      resultPath: '',
      etlCompletedAt: new Date(),
    });

    await this.etlResultRepository.save(etlResult);

    // Start mock ETL pipeline (async)
    this.runMockEtlPipeline(etlResult, labcode, barcode, user.id).catch(
      async (error) => {
        // Mark as failed if pipeline fails
        etlResult.status = EtlResultStatus.FAILED;
        etlResult.comment = `Processing failed: ${error.message}`;
        await this.etlResultRepository.save(etlResult);
      },
    );
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
      etlResult.comment = `ETL Pipeline failed: ${error.message}`;
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
        etlResult.comment = `Analysis cancelled due to FastQ file pair rejection: ${redoReason}`;
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
    // Find the ETL result that's completed
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId, status: EtlResultStatus.COMPLETED },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
            assignment: true,
          },
        },
      },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `Completed ETL result with ID ${etlResultId} not found`,
      );
    }

    const labSession = etlResult.labcodeLabSession?.labSession;
    const assignment = labSession?.assignment;

    if (!labSession || !assignment) {
      return errorLabSession.labSessionNotFound;
    }

    const barcode = labSession.patient.barcode;
    const labcode = [etlResult.labcodeLabSession?.labcode || 'unknown'];

    if (assignment.validationId) {
      await this.notificationService.createNotification({
        title: `Chỉ định thẩm định.`,
        message: `File kết quả ETL #${etlResultId} của lần khám với mã barcode ${barcode} đã được gửi mới`,
        taskType: TypeTaskNotification.VALIDATION_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.RESEND,
        labcode: labcode,
        barcode: barcode,
        senderId: user.id,
        receiverId: validationId,
      });
    }

    if (!assignment.validationId && validationId) {
      assignment.validationId = validationId;
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
    }

    if (!assignment.validationId && !validationId) {
      return errorValidation.validationIdRequired;
    }

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

    if (existingProcessingEtl && existingProcessingEtl.id !== etlResultId) {
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

    // Reset the ETL result for retry
    etlResult.status = EtlResultStatus.PROCESSING;
    etlResult.resultPath = '';

    etlResult.etlCompletedAt = new Date();
    await this.etlResultRepository.save(etlResult);

    // Start mock ETL pipeline (async) for retry
    this.runMockEtlPipeline(etlResult, labcode, barcode, user.id).catch(
      async (error) => {
        // Mark as failed if pipeline fails again
        etlResult.status = EtlResultStatus.FAILED;
        etlResult.comment = `Retry failed: ${error.message}`;
        etlResult.commentBy = user.id;
        await this.etlResultRepository.save(etlResult);
      },
    );

    return {
      message: 'ETL process retry started successfully',
    };
  }
}
