import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFile, FastqFileStatus } from '../entities/fastq-file.entity';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
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
    @InjectRepository(FastqFile)
    private fastqFileRepository: Repository<FastqFile>,
    @InjectRepository(EtlResult)
    private etlResultRepository: Repository<EtlResult>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

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

    // Create query builder for lab sessions that have FastQ files with specific statuses
    const queryBuilder: SelectQueryBuilder<LabSession> =
      this.labSessionRepository
        .createQueryBuilder('labSession')
        .leftJoinAndSelect('labSession.patient', 'patient')
        .leftJoinAndSelect('labSession.doctor', 'doctor')
        .leftJoinAndSelect('labSession.validation', 'validation')
        .select([
          'labSession.id',
          'labSession.labcode',
          'labSession.barcode',
          'labSession.requestDate',
          'labSession.createdAt',
          'labSession.metadata',
          'patient.id',
          'patient.fullName',
          'patient.dateOfBirth',
          'patient.phone',
          'patient.address',
          'patient.citizenId',
          'patient.createdAt',
          'doctor.id',
          'doctor.name',
          'doctor.email',
          'doctor.metadata',
          'validation.id',
          'validation.name',
          'validation.email',
          'validation.metadata',
        ])
        // Include sessions that have FastQ files with WAIT_FOR_APPROVAL, REJECTED, or APPROVED status
        .innerJoin(
          'labSession.fastqFiles',
          'fastqFile',
          'fastqFile.status IN (:...allowedStatuses)',
          {
            allowedStatuses: [
              FastqFileStatus.WAIT_FOR_APPROVAL,
              FastqFileStatus.REJECTED,
              FastqFileStatus.APPROVED,
            ],
          },
        )
        .where('labSession.analysisId = :userId', { userId: user.id })
        .andWhere('labSession.typeLabSession = :type', { type: 'test' });

    // Apply search functionality (search by patient personalId and fullName)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(patient.citizenId) LIKE :search OR LOWER(patient.fullName) LIKE :search)',
        { search: searchTerm },
      );
    }

    // Apply date range filtering on requestDate
    if (dateFrom) {
      queryBuilder.andWhere('labSession.requestDate >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      queryBuilder.andWhere('labSession.requestDate <= :dateTo', {
        dateTo: new Date(dateTo),
      });
    }

    // Apply filter functionality (filter by ETL status)
    if (filter && filter.etlStatus) {
      const subQuery = this.etlResultRepository
        .createQueryBuilder('etlResult')
        .select('DISTINCT etlResult.sessionId')
        .where('etlResult.status = :etlStatus', {
          etlStatus: filter.etlStatus,
        });

      queryBuilder.andWhere(`labSession.id IN (${subQuery.getQuery()})`, {
        etlStatus: filter.etlStatus,
      });
    }

    // Apply dynamic sorting
    // if (sortBy && sortOrder) {
    //   const allowedSortFields = {
    //     id: 'labSession.id',
    //     labcode: 'labSession.labcode',
    //     barcode: 'labSession.barcode',
    //     requestDate: 'labSession.requestDate',
    //     createdAt: 'labSession.createdAt',
    //     'patient.fullName': 'patient.fullName',
    //     'patient.personalId': 'patient.personalId',
    //     'doctor.name': 'doctor.name',
    //     fullName: 'patient.fullName',
    //     personalId: 'patient.personalId',
    //     doctorName: 'doctor.name',
    //   };

    //   const sortField = allowedSortFields[sortBy];
    //   if (sortField) {
    //     queryBuilder.orderBy(sortField, sortOrder);
    //   } else {
    //     // Default sort by FastQ status priority (WAIT_FOR_APPROVAL, REJECTED, APPROVED) then by creation date
    //     queryBuilder
    //       .addSelect('fastqFile.status', 'fastqStatus')
    //       .orderBy(
    //         `CASE fastqFile.status
    //          WHEN '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 1
    //          WHEN '${FastqFileStatus.REJECTED}' THEN 2
    //          WHEN '${FastqFileStatus.APPROVED}' THEN 3
    //          ELSE 4 END`,
    //       )
    //       .addOrderBy('labSession.createdAt', 'DESC');
    //   }
    // } else {
    //   // Default sort by FastQ status priority (WAIT_FOR_APPROVAL, REJECTED, APPROVED) then by creation date
    //   queryBuilder
    //     .addSelect('fastqFile.status', 'fastqStatus')
    //     .orderBy(
    //       `CASE fastqFile.status
    //        WHEN '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 1
    //        WHEN '${FastqFileStatus.REJECTED}' THEN 2
    //        WHEN '${FastqFileStatus.APPROVED}' THEN 3
    //        ELSE 4 END`,
    //     )
    //     .addOrderBy('labSession.createdAt', 'DESC');
    // }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [sessions, total] = await queryBuilder.getManyAndCount();

    // For each session, get the latest FastQ file and ETL result
    const sessionsWithLatest = await Promise.all(
      sessions.map(async (session) => {
        const [latestFastqFile, latestEtlResult] = await Promise.all([
          this.fastqFileRepository.findOne({
            where: {
              sessionId: session.id,
              status: In([
                FastqFileStatus.WAIT_FOR_APPROVAL,
                FastqFileStatus.REJECTED,
                FastqFileStatus.APPROVED,
              ]),
            },
            relations: { creator: true, rejector: true },
            select: {
              id: true,
              filePath: true,
              createdAt: true,
              status: true,
              redoReason: true,
              creator: { id: true, name: true, email: true },
              rejector: { id: true, name: true, email: true },
            },
            order: { createdAt: 'DESC' },
          }),
          this.etlResultRepository.findOne({
            where: { sessionId: session.id },
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

        return {
          ...session,
          latestFastqFile,
          latestEtlResult,
        };
      }),
    );

    return new PaginatedResponseDto(sessionsWithLatest, page, limit, total);
  }

  async findAnalysisSessionById(
    id: number,
  ): Promise<AnalysisSessionDetailResponseDto> {
    // First check if the session has FastQ files with allowed statuses
    const sessionWithFastq = await this.labSessionRepository.findOne({
      where: {
        id,
        fastqFiles: {
          status: In([
            FastqFileStatus.WAIT_FOR_APPROVAL,
            FastqFileStatus.REJECTED,
            FastqFileStatus.APPROVED,
          ]),
        },
      },
      relations: { fastqFiles: true },
      select: { id: true, fastqFiles: { status: true } },
    });

    if (!sessionWithFastq) {
      throw new NotFoundException(
        `Analysis session with ID ${id} not found or no FastQ files with valid status`,
      );
    }

    const session = await this.labSessionRepository.findOne({
      where: { id },
      relations: {
        patient: true,
        doctor: true,
        validation: true,
        fastqFiles: {
          creator: true,
          rejector: true,
        },
        etlResults: {
          rejector: true,
          commenter: true,
        },
      },
      select: {
        id: true,
        labcode: true,
        barcode: true,
        requestDate: true,
        createdAt: true,
        metadata: true,
        patient: {
          id: true,
          fullName: true,
          dateOfBirth: true,
          phone: true,
          address: true,
          citizenId: true,
          createdAt: true,
        },
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
        fastqFiles: {
          id: true,
          filePath: true,
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

    if (!session) {
      throw new NotFoundException(`Analysis session with ID ${id} not found`);
    }

    // Filter FastQ files to only include allowed statuses
    session.fastqFiles = session.fastqFiles.filter(
      (file) =>
        file.status &&
        [
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.REJECTED,
          FastqFileStatus.APPROVED,
        ].includes(file.status),
    );

    // Sort FastQ files by createdAt in descending order (newest first)
    session.fastqFiles.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Sort ETL results by createdAt in descending order (newest first)
    session.etlResults.sort((a, b) => {
      return (
        new Date(b.etlCompletedAt).getTime() -
        new Date(a.etlCompletedAt).getTime()
      );
    });

    return session;
  }

  async processAnalysis(
    fastqFileId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the FastQ file
    const fastqFile = await this.fastqFileRepository.findOne({
      where: {
        id: fastqFileId,
        status: In([
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.APPROVED,
        ]),
      },
      relations: { session: true },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `Approved FastQ file with ID ${fastqFileId} not found`,
      );
    }

    // update fastq file status to APPROVED
    fastqFile.status = FastqFileStatus.APPROVED;
    fastqFile.approveBy = user.id;
    await this.fastqFileRepository.save(fastqFile);
    await this.notificationService.createNotification({
      title: `Trạng thái file Fastq #${fastqFile.id}.`,
      message: `File Fastq #${fastqFile.id} của lần khám với Barcode ${fastqFile.session?.barcode} đã được duyệt`,
      taskType: TypeTaskNotification.LAB_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.ACCEPT,
      labcode: fastqFile.session?.labcode,
      barcode: fastqFile.session?.barcode,
      senderId: user.id,
      receiverId: fastqFile.createdBy,
    });

    // Check if analysis is already in progress for this session
    const existingEtl = await this.etlResultRepository.findOne({
      where: {
        sessionId: fastqFile.sessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (existingEtl) {
      throw new BadRequestException(
        'Analysis is already in progress for this session',
      );
    }

    // Create ETL result entry with pending status
    const etlResult = this.etlResultRepository.create({
      sessionId: fastqFile.sessionId,
      resultPath: '',
      etlCompletedAt: new Date(),
    });

    await this.etlResultRepository.save(etlResult);

    // Start mock ETL pipeline (async)
    this.runMockEtlPipeline(
      etlResult,
      fastqFile.session.labcode,
      fastqFile.session.barcode,
      user.id,
    ).catch(async (error) => {
      // Mark as failed if pipeline fails
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.comment = `Processing failed: ${error.message}`;
      await this.etlResultRepository.save(etlResult);
    });
    return {
      message: 'Analysis pipeline started successfully',
    };
  }

  private async runMockEtlPipeline(
    etlResult: EtlResult,
    labcode: string,
    barcode: string,
    userId: number,
  ): Promise<void> {
    const notificaitonReqs: CreateNotificationReqDto[] = [];

    try {
      // Update status to processing
      etlResult.status = EtlResultStatus.PROCESSING;
      await this.etlResultRepository.save(etlResult);

      // Mock processing delay (simulate ETL pipeline work)
      await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds

      // Generate mock analysis result content
      const analysisContent = this.generateMockAnalysisResult(labcode);

      // Create filename for the result
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `analysis-result-${labcode}-${timestamp}.txt`;

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
      where: { id: etlResultId, status: EtlResultStatus.COMPLETED },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `Completed ETL result with ID ${etlResultId} not found`,
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
    fastqFileId: number,
    redoReason: string,
    user: AuthenticatedUser,
  ) {
    // Find the FastQ file that's pending approval or approved
    const fastqFile = await this.fastqFileRepository.findOne({
      where: {
        id: fastqFileId,
        status: FastqFileStatus.WAIT_FOR_APPROVAL,
      },
      relations: { session: true },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `FastQ file with ID ${fastqFileId} not found or not in wait_for_approval status`,
      );
    }

    // Update FastQ file status to rejected with redo reason
    fastqFile.status = FastqFileStatus.REJECTED;
    fastqFile.redoReason = redoReason;
    fastqFile.rejectBy = user.id;

    await this.fastqFileRepository.save(fastqFile);

    try {
      this.notificationService.createNotification({
        title: `Trạng thái file Fastq #${fastqFile.id}.`,
        message: `File Fastq #${fastqFile.id} của lần khám với Barcode ${fastqFile?.session.barcode} đã bị từ chối`,
        taskType: TypeTaskNotification.LAB_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.REJECT,
        labcode: fastqFile?.session?.labcode,
        barcode: fastqFile?.session?.barcode,
        senderId: user.id,
        receiverId: fastqFile.createdBy,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to create notification for FastQ file rejection: ${error.message}`,
      );
    }

    // If there are any pending or processing ETL results for this session, mark them as failed
    const pendingEtlResults = await this.etlResultRepository.find({
      where: {
        sessionId: fastqFile.sessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (pendingEtlResults.length > 0) {
      for (const etlResult of pendingEtlResults) {
        etlResult.status = EtlResultStatus.FAILED;
        etlResult.comment = `Analysis cancelled due to FastQ file rejection: ${redoReason}`;
        etlResult.rejectBy = user.id;
        await this.etlResultRepository.save(etlResult);
      }
    }

    return {
      message: `FastQ file rejected successfully. Reason: ${redoReason}`,
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
      relations: { session: true },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `Completed ETL result with ID ${etlResultId} not found`,
      );
    }
    const labSession = await this.labSessionRepository.findOne({
      where: { id: etlResult.session.id },
    });

    if (!labSession) {
      return errorLabSession.labSessionNotFound;
    }

    if (labSession.validationId) {
      await this.notificationService.createNotification({
        title: `Chỉ định thẩm định.`,
        message: `File kết quả ETL #${etlResultId} của lần khám với mã barcode ${labSession.barcode} đã được gửi mới`,
        taskType: TypeTaskNotification.VALIDATION_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.RESEND,
        labcode: labSession.labcode,
        barcode: labSession.barcode,
        senderId: user.id,
        receiverId: validationId,
      });
    }

    if (!labSession.validationId && validationId) {
      labSession.validationId = validationId;
      await this.labSessionRepository.save(labSession);
      await this.notificationService.createNotification({
        title: `Chỉ định thẩm định.`,
        message: `Bạn đã được chỉ định thẩm định lần khám với mã labcode ${labSession.labcode} và mã barcode ${labSession.barcode}`,
        taskType: TypeTaskNotification.VALIDATION_TASK,
        type: TypeNotification.ACTION,
        subType: SubTypeNotification.ASSIGN,
        labcode: labSession.labcode,
        barcode: labSession.barcode,
        senderId: user.id,
        receiverId: validationId,
      });
    }

    if (!labSession.validationId && !validationId) {
      return errorValidation.validationIdRequired;
    }

    // Update ETL result status to WAIT_FOR_APPROVAL
    etlResult.status = EtlResultStatus.WAIT_FOR_APPROVAL;
    etlResult.comment = 'Sent to validation for review';
    etlResult.commentBy = user.id;
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
      relations: { session: true },
    });

    if (!etlResult) {
      throw new NotFoundException(
        `Failed ETL result with ID ${etlResultId} not found`,
      );
    }

    // Check if there's already another ETL process running for this session
    const existingProcessingEtl = await this.etlResultRepository.findOne({
      where: {
        sessionId: etlResult.sessionId,
        status: EtlResultStatus.PROCESSING,
      },
    });

    if (existingProcessingEtl && existingProcessingEtl.id !== etlResultId) {
      throw new BadRequestException(
        'Another ETL process is already running for this session',
      );
    }

    // Find and update the latest FastQ file status to APPROVED
    const latestFastqFile = await this.fastqFileRepository.findOne({
      where: {
        sessionId: etlResult.sessionId,
        status: In([
          FastqFileStatus.WAIT_FOR_APPROVAL,
          FastqFileStatus.REJECTED,
          FastqFileStatus.APPROVED,
        ]),
      },
      order: { createdAt: 'DESC' },
      relations: { session: true },
    });

    if (
      latestFastqFile &&
      latestFastqFile.status !== FastqFileStatus.APPROVED
    ) {
      latestFastqFile.status = FastqFileStatus.APPROVED;
      latestFastqFile.approveBy = user.id;
      await this.fastqFileRepository.save(latestFastqFile);
      await this.notificationService
        .createNotification({
          title: `Trạng thái file Fastq #${latestFastqFile.id}.`,
          message: `File Fastq #${latestFastqFile.id} của lần khám với Barcode ${latestFastqFile.session?.barcode} đã được duyệt`,
          taskType: TypeTaskNotification.LAB_TASK,
          type: TypeNotification.PROCESS,
          subType: SubTypeNotification.RETRY,
          labcode: latestFastqFile.session?.labcode,
          barcode: latestFastqFile.session?.barcode,
          senderId: user.id,
          receiverId: latestFastqFile.createdBy,
        })
        .catch((error) => {
          throw new InternalServerErrorException(
            `Failed to create notification for FastQ file approval: ${error.message}`,
          );
        });
    }

    // Reset the ETL result for retry
    etlResult.status = EtlResultStatus.PROCESSING;
    etlResult.resultPath = '';
    etlResult.comment = `Retried by ${user.name} at ${new Date().toISOString()}`;
    etlResult.commentBy = user.id;
    etlResult.etlCompletedAt = new Date();
    await this.etlResultRepository.save(etlResult);

    // Start mock ETL pipeline (async) for retry
    this.runMockEtlPipeline(
      etlResult,
      etlResult.session.labcode,
      etlResult.session.barcode,
      user.id,
    ).catch(async (error) => {
      // Mark as failed if pipeline fails again
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.comment = `Retry failed: ${error.message}`;
      etlResult.commentBy = user.id;
      await this.etlResultRepository.save(etlResult);
    });

    return {
      message: 'ETL process retry started successfully',
    };
  }
}
