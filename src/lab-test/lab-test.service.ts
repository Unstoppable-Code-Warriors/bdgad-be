import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFile, FastqFileStatus } from '../entities/fastq-file.entity';
import {
  LabSessionWithFastqResponseDto,
  LabSessionWithAllFastqResponseDto,
  FastqFileResponseDto,
} from './dto/lab-session-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../auth/types/user.types';
import { S3Service } from '../utils/s3.service';
import { S3Bucket, TypeNotification, TypeTaskNotification, SubTypeNotification } from '../utils/constant';
import { errorAnalysis, errorLabSession } from 'src/utils/errorRespones';
import { User } from 'src/entities/user.entity';
import { CreateMultiNotificationReqDto } from 'src/notification/dto/create-notifications.req.dto';
import { CreateNotificationReqDto } from 'src/notification/dto/create-notification.req.dto';
import { Notifications } from 'src/entities/notification.entity';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class LabTestService {
  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
    @InjectRepository(LabSession)
    private labSessionRepository: Repository<LabSession>,
    @InjectRepository(FastqFile)
    private fastqFileRepository: Repository<FastqFile>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Helper method to map FastqFile entity to FastqFileResponseDto
   */
  private mapFastqFileToDto(fastqFile: FastqFile): FastqFileResponseDto {
    return {
      id: fastqFile.id,
      filePath: fastqFile.filePath,
      createdAt: fastqFile.createdAt,
      status: fastqFile.status || 'unknown', // Handle null status
      redoReason: fastqFile.redoReason || '', // Handle null redoReason
      creator: {
        id: fastqFile.creator.id,
        name: fastqFile.creator.name,
        email: fastqFile.creator.email,
      },
      rejector: fastqFile.rejector
        ? {
            id: fastqFile.rejector.id,
            name: fastqFile.rejector.name,
            email: fastqFile.rejector.email,
          }
        : undefined,
    };
  }

  async findAllSession(query: PaginationQueryDto, user: AuthenticatedUser) {
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

    // Create query builder for more complex queries
    const queryBuilder: SelectQueryBuilder<LabSession> =
      this.labSessionRepository
        .createQueryBuilder('labSession')
        .leftJoinAndSelect('labSession.patient', 'patient')
        .leftJoinAndSelect('labSession.doctor', 'doctor')
        .leftJoinAndSelect('labSession.analysis', 'analysis')
        .leftJoin('labSession.fastqFiles', 'fastqFile')
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
          'analysis.id',
          'analysis.name',
          'analysis.email',
          'doctor.id',
          'doctor.name',
          'doctor.email',
          'doctor.metadata',
        ])
        .where('labSession.labTestingId = :userId', { userId: user.id })
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

    // Apply filter functionality (filter by status from FastqFile)
    if (filter && filter.status) {
      // Create a subquery to filter by FastqFile status
      const subQuery = this.fastqFileRepository
        .createQueryBuilder('fastqFile')
        .select('DISTINCT fastqFile.sessionId')
        .where('fastqFile.status = :status', { status: filter.status });

      queryBuilder.andWhere(`labSession.id IN (${subQuery.getQuery()})`, {
        status: filter.status,
      });
    }

    // Apply dynamic sorting for all columns
    // if (sortBy && sortOrder) {
    //   const allowedSortFields = {
    //     // Lab Session fields
    //     id: 'labSession.id',
    //     labcode: 'labSession.labcode',
    //     barcode: 'labSession.barcode',
    //     requestDate: 'labSession.requestDate',
    //     createdAt: 'labSession.createdAt',

    //     // Patient fields
    //     'patient.id': 'patient.id',
    //     'patient.fullName': 'patient.fullName',
    //     'patient.personalId': 'patient.personalId',
    //     'patient.dateOfBirth': 'patient.dateOfBirth',
    //     'patient.phone': 'patient.phone',
    //     'patient.address': 'patient.address',
    //     'patient.citizenId': 'patient.citizenId',
    //     'patient.createdAt': 'patient.createdAt',

    //     // Doctor fields
    //     'doctor.id': 'doctor.id',
    //     'doctor.name': 'doctor.name',
    //     'doctor.email': 'doctor.email',

    //     // Shorthand for common fields
    //     fullName: 'patient.fullName',
    //     personalId: 'patient.personalId',
    //     doctorName: 'doctor.name',
    //     doctorEmail: 'doctor.email',
    //   };

    //   const sortField = allowedSortFields[sortBy];
    //   if (sortField) {
    //     queryBuilder.orderBy(sortField, sortOrder);
    //   } else {
    //     // Default sort by FastQ status priority (null, UPLOADED, REJECTED, WAIT_FOR_APPROVAL, APPROVED) then by creation date
    //     queryBuilder
    //       .addSelect('fastqFile.status', 'fastqStatus')
    //       .orderBy(
    //         `CASE
    //          WHEN fastqFile.status IS NULL THEN 1
    //          WHEN fastqFile.status = '${FastqFileStatus.UPLOADED}' THEN 2
    //          WHEN fastqFile.status = '${FastqFileStatus.REJECTED}' THEN 3
    //          WHEN fastqFile.status = '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 4
    //          WHEN fastqFile.status = '${FastqFileStatus.APPROVED}' THEN 5
    //          ELSE 6 END`,
    //       )
    //       .addOrderBy('labSession.createdAt', 'DESC');
    //   }
    // } else {
    //   // Default sort by FastQ status priority (null, UPLOADED, REJECTED, WAIT_FOR_APPROVAL, APPROVED) then by creation date
    //   queryBuilder
    //     .addSelect('fastqFile.status', 'fastqStatus')
    //     .orderBy(
    //       `CASE
    //        WHEN fastqFile.status IS NULL THEN 1
    //        WHEN fastqFile.status = '${FastqFileStatus.UPLOADED}' THEN 2
    //        WHEN fastqFile.status = '${FastqFileStatus.REJECTED}' THEN 3
    //        WHEN fastqFile.status = '${FastqFileStatus.WAIT_FOR_APPROVAL}' THEN 4
    //        WHEN fastqFile.status = '${FastqFileStatus.APPROVED}' THEN 5
    //        ELSE 6 END`,
    //     )
    //     .addOrderBy('labSession.createdAt', 'DESC');
    // }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [sessions, total] = await queryBuilder.getManyAndCount();

    // For each session, get the latest FastQ file
    const sessionsWithLatestFastq = await Promise.all(
      sessions.map(async (session) => {
        const latestFastqFile = await this.fastqFileRepository.findOne({
          where: { sessionId: session.id },
          relations: {
            creator: true,
            rejector: true,
          },
          select: {
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
          order: {
            createdAt: 'DESC',
          },
        });

        return {
          ...session,
          latestFastqFile: latestFastqFile
            ? this.mapFastqFileToDto(latestFastqFile)
            : null,
        };
      }),
    );

    return new PaginatedResponseDto(
      sessionsWithLatestFastq,
      page,
      limit,
      total,
    );
  }

  async findSessionById(
    id: number,
  ): Promise<LabSessionWithAllFastqResponseDto> {
    // Find the session with related data using a single query with joins
    const session = await this.labSessionRepository.findOne({
      where: { id },
      relations: {
        patient: true,
        doctor: true,
        analysis: true,
        fastqFiles: {
          creator: true,
          rejector: true,
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
        analysis: {
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
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    // Sort FastQ files by createdAt in descending order (newest first)
    const sortedFastqFiles = session.fastqFiles
      ? session.fastqFiles.sort((a, b) => {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })
      : [];

    return {
      ...session,
      fastqFiles: sortedFastqFiles.map((file) => this.mapFastqFileToDto(file)),
    };
  }

  async uploadFastQ(
    id: number,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }

    // Validate file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new Error(
        `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 100MB`,
      );
    }

    // Validate file extension
    const allowedExtensions = ['.fastq', '.fq', '.fastq.gz', '.fq.gz'];
    const hasValidExtension = allowedExtensions.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext),
    );
    if (!hasValidExtension) {
      throw new Error(
        `Invalid file type. Only FastQ files (.fastq, .fq, .fastq.gz, .fq.gz) are allowed`,
      );
    }

    const session = await this.labSessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    // Generate unique filename for S3
    const timestamp = Date.now();
    const s3Key = `fastq/${id}/${timestamp}_${file.originalname}`;

    try {
      // Upload file to S3 (Cloudflare R2)
      const s3Url = await this.s3Service.uploadFile(
        S3Bucket.FASTQ_FILE,
        s3Key,
        file.buffer,
        file.mimetype,
      );

      // Create FastqFile record with S3 URL
      const fastqFile = this.fastqFileRepository.create({
        sessionId: id,
        filePath: s3Url,
        status: FastqFileStatus.UPLOADED,
        createdBy: user.id,
      });

      await this.fastqFileRepository.save(fastqFile);
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async downloadFastQ(fastqFileId: number): Promise<string> {
    // Find the FastQ file record
    const fastqFile = await this.fastqFileRepository.findOne({
      where: { id: fastqFileId },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `FastQ file with id ${fastqFileId} not found`,
      );
    }

    if (!fastqFile.filePath) {
      throw new NotFoundException(
        `No file path found for FastQ file with id ${fastqFileId}`,
      );
    }

    try {
      // Extract the S3 key from the stored S3 URL
      const s3Key = this.s3Service.extractKeyFromUrl(
        fastqFile.filePath,
        S3Bucket.FASTQ_FILE,
      );

      // Generate presigned download URL (valid for 1 hour)
      const presignedUrl = await this.s3Service.generatePresigned(
        S3Bucket.FASTQ_FILE,
        s3Key,
        3600, // 1 hour expiration
      );

      return presignedUrl;
    } catch (error) {
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  async deleteFastQ(
    fastqFileId: number,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Find the FastQ file record
    const fastqFile = await this.fastqFileRepository.findOne({
      where: { id: fastqFileId },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `FastQ file with id ${fastqFileId} not found`,
      );
    }

    // Check if the file status allows deletion (only UPLOADED status can be deleted)
    if (fastqFile.status !== FastqFileStatus.UPLOADED) {
      throw new BadRequestException(
        `Cannot delete FastQ file. Only files with status 'uploaded' can be deleted. Current status: ${fastqFile.status}`,
      );
    }

    try {
      // Delete file from S3 if it exists
      if (fastqFile.filePath) {
        const s3Key = this.s3Service.extractKeyFromUrl(
          fastqFile.filePath,
          S3Bucket.FASTQ_FILE,
        );
        await this.s3Service.deleteFile(S3Bucket.FASTQ_FILE, s3Key);
      }

      // Delete the database record
      await this.fastqFileRepository.remove(fastqFile);
    } catch (error) {
      throw new Error(`Failed to delete FastQ file: ${error.message}`);
    }
  }
  async sendToAnalysis(
    fastqFileId: number,
    analysisId: number,
    user: AuthenticatedUser,
  ) {
    let notificationReq: CreateNotificationReqDto = {
      title: 'Chỉ định phân tích.',
      message: '',
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.ACTION,
      subType: SubTypeNotification.ASSIGN,
      labcode: '',
      barcode: '',
      senderId: user.id,
      receiverId: analysisId,
    };
    // Find the FastQ file record
    const fastqFile = await this.fastqFileRepository.findOne({
      where: { id: fastqFileId },
    });

    if (!fastqFile) {
      throw new NotFoundException(
        `FastQ file with id ${fastqFileId} not found`,
      );
    }

    // Check if the file status allows sending to analysis (only UPLOADED status can be sent)
    if (fastqFile.status !== FastqFileStatus.UPLOADED) {
      throw new BadRequestException(
        `Cannot send FastQ file to analysis. Only files with status 'uploaded' can be sent to analysis. Current status: ${fastqFile.status}`,
      );
    }
    const AnalysisSession = await this.labSessionRepository.findOne({
      where: { id: fastqFile.sessionId },
    });
    if (!AnalysisSession) {
      return errorLabSession.labSessionNotFound;
    }

    if (AnalysisSession?.analysisId) {
      notificationReq.subType = SubTypeNotification.RESEND;
      notificationReq.message = `File Fastq #${fastqFile.id} của lần khám với mã labcode ${AnalysisSession.labcode} và mã barcode ${AnalysisSession.barcode} đã được gửi mới`;
      notificationReq.labcode = AnalysisSession.labcode;
      notificationReq.barcode = AnalysisSession.barcode;
    }

    if (!AnalysisSession?.analysisId && !analysisId) {
      return errorAnalysis.analysisIdRequired;
    } else if (!AnalysisSession?.analysisId && analysisId) {
      AnalysisSession.analysisId = analysisId;
      const labSession = await this.labSessionRepository.save(AnalysisSession);
      notificationReq.message = `Bạn đã được chỉ định phân tích lần khám với mã labcode ${labSession.labcode} và mã barcode ${labSession.barcode}`;
      notificationReq.labcode = labSession.labcode;
      notificationReq.barcode = labSession.barcode;
    }

    try {
      // Update the status to WAIT_FOR_APPROVAL
      fastqFile.status = FastqFileStatus.WAIT_FOR_APPROVAL;
      await this.fastqFileRepository.save(fastqFile);
      await this.notificationService.createNotification(notificationReq);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to send FastQ file to analysis: ${error.message}`,
      );
    }
  }
}
