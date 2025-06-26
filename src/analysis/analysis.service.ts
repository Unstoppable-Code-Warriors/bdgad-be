import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
import { S3Bucket } from '../utils/constant';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    @InjectRepository(LabSession)
    private labSessionRepository: Repository<LabSession>,
    @InjectRepository(FastqFile)
    private fastqFileRepository: Repository<FastqFile>,
    @InjectRepository(EtlResult)
    private etlResultRepository: Repository<EtlResult>,
  ) {}

  async findAllAnalysisSessions(
    query: PaginationQueryDto,
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
          'patient.personalId',
          'patient.healthInsuranceCode',
          'patient.createdAt',
          'doctor.id',
          'doctor.name',
          'doctor.email',
          'doctor.metadata',
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
        );

    // Apply search functionality (search by patient personalId and fullName)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(patient.personalId) LIKE :search OR LOWER(patient.fullName) LIKE :search)',
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
    if (sortBy && sortOrder) {
      const allowedSortFields = {
        id: 'labSession.id',
        labcode: 'labSession.labcode',
        barcode: 'labSession.barcode',
        requestDate: 'labSession.requestDate',
        createdAt: 'labSession.createdAt',
        'patient.fullName': 'patient.fullName',
        'patient.personalId': 'patient.personalId',
        'doctor.name': 'doctor.name',
        fullName: 'patient.fullName',
        personalId: 'patient.personalId',
        doctorName: 'doctor.name',
      };

      const sortField = allowedSortFields[sortBy];
      if (sortField) {
        queryBuilder.orderBy(sortField, sortOrder);
      } else {
        // Default sort by FastQ status priority (WAIT_FOR_APPROVAL, REJECTED, APPROVED) then by creation date
        queryBuilder
          .addSelect('fastqFile.status', 'fastqStatus')
          .orderBy(
            `CASE fastqFile.status 
             WHEN '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 1 
             WHEN '${FastqFileStatus.REJECTED}' THEN 2 
             WHEN '${FastqFileStatus.APPROVED}' THEN 3 
             ELSE 4 END`,
          )
          .addOrderBy('labSession.createdAt', 'DESC');
      }
    } else {
      // Default sort by FastQ status priority (WAIT_FOR_APPROVAL, REJECTED, APPROVED) then by creation date
      queryBuilder
        .addSelect('fastqFile.status', 'fastqStatus')
        .orderBy(
          `CASE fastqFile.status 
           WHEN '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 1 
           WHEN '${FastqFileStatus.REJECTED}' THEN 2 
           WHEN '${FastqFileStatus.APPROVED}' THEN 3 
           ELSE 4 END`,
        )
        .addOrderBy('labSession.createdAt', 'DESC');
    }

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
            relations: { creator: true },
            select: {
              id: true,
              filePath: true,
              createdAt: true,
              status: true,
              redoReason: true,
              creator: { id: true, name: true, email: true },
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
        fastqFiles: {
          creator: true,
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
          personalId: true,
          healthInsuranceCode: true,
          createdAt: true,
        },
        doctor: {
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

    // Sort FastQ files by status priority first, then by creation date
    session.fastqFiles.sort((a, b) => {
      const statusPriority = {
        [FastqFileStatus.WAIT_FOR_APPROVAL]: 1,
        [FastqFileStatus.REJECTED]: 2,
        [FastqFileStatus.APPROVED]: 3,
      };

      const aPriority = a.status ? statusPriority[a.status] || 4 : 4;
      const bPriority = b.status ? statusPriority[b.status] || 4 : 4;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Sort ETL results by completion date
    session.etlResults.sort(
      (a, b) =>
        new Date(b.etlCompletedAt).getTime() -
        new Date(a.etlCompletedAt).getTime(),
    );

    return session;
  }

  async processAnalysis(
    fastqFileId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the FastQ file
    const fastqFile = await this.fastqFileRepository.findOne({
      where: { id: fastqFileId, status: FastqFileStatus.APPROVED },
      relations: { session: true },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `Approved FastQ file with ID ${fastqFileId} not found`,
      );
    }

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
    this.runMockEtlPipeline(etlResult, fastqFile.session.labcode).catch(
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
    labcode: string,
  ): Promise<void> {
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
    } catch (error) {
      // Handle pipeline failure
      etlResult.status = EtlResultStatus.FAILED;
      etlResult.comment = `ETL Pipeline failed: ${error.message}`;
      await this.etlResultRepository.save(etlResult);
      throw error;
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
    const downloadUrl = await this.s3Service.generatePresignedDownloadUrl(
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
  ): Promise<{ message: string }> {
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
}
