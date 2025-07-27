import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { LabSession } from '../entities/lab-session.entity';
import { FastqFile } from '../entities/fastq-file.entity';
import {
  FastqFilePair,
  FastqFileStatus,
} from '../entities/fastq-file-pair.entity';
import {
  LabSessionWithFastqResponseDto,
  LabSessionWithAllFastqResponseDto,
  FastqFileResponseDto,
  FastqFilePairResponseDto,
} from './dto/lab-session-response.dto';
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
    @InjectRepository(FastqFilePair)
    private fastqFilePairRepository: Repository<FastqFilePair>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Map FastqFilePair entity to FastqFilePairResponseDto
   */
  private mapFastqFilePairToDto(
    fastqFilePair: FastqFilePair,
  ): FastqFilePairResponseDto {
    return {
      id: fastqFilePair.id,
      createdAt: fastqFilePair.createdAt,
      status: fastqFilePair.status || 'unknown',
      redoReason: fastqFilePair.redoReason || '',
      fastqFileR1: {
        id: fastqFilePair.fastqFileR1.id,
        filePath: fastqFilePair.fastqFileR1.filePath,
        createdAt: fastqFilePair.fastqFileR1.createdAt,
      },
      fastqFileR2: {
        id: fastqFilePair.fastqFileR2.id,
        filePath: fastqFilePair.fastqFileR2.filePath,
        createdAt: fastqFilePair.fastqFileR2.createdAt,
      },
      creator: {
        id: fastqFilePair.creator.id,
        name: fastqFilePair.creator.name,
        email: fastqFilePair.creator.email,
      },
      rejector: fastqFilePair.rejector
        ? {
            id: fastqFilePair.rejector.id,
            name: fastqFilePair.rejector.name,
            email: fastqFilePair.rejector.email,
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
        .leftJoin('labSession.fastqFilePairs', 'fastqFilePairs')
        .select([
          'labSession.id',
          'labSession.labcode',
          'labSession.requestDate',
          'labSession.createdAt',
          'labSession.metadata',
          'patient.id',
          'patient.fullName',
          'patient.dateOfBirth',
          'patient.phone',
          'patient.address',
          'patient.citizenId',
          'patient.barcode',
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
        queryBuilder.orderBy('labSession.requestDate', 'DESC');

    // Apply search functionality (search by labcode and barcode)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(labSession.labcode) LIKE :search OR LOWER(patient.barcode) LIKE :search)',
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
    //     barcode: 'patient.barcode',
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

    // For each session, get the latest FastQ file pair
    const sessionsWithLatestFastq = await Promise.all(
      sessions.map(async (session) => {
        const latestFastqFilePair = await this.fastqFilePairRepository.findOne({
          where: { sessionId: session.id },
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
          barcode: session.patient.barcode,
          latestFastqFilePair: latestFastqFilePair
            ? this.mapFastqFilePairToDto(latestFastqFilePair)
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
        fastqFilePairs: {
          creator: true,
          rejector: true,
          fastqFileR1: true,
          fastqFileR2: true,
        },
      },
      select: {
        id: true,
        labcode: true,
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
          barcode: true,
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
        fastqFilePairs: {
          id: true,
          createdAt: true,
          status: true,
          redoReason: true,
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

    // Sort FastQ file pairs by createdAt in descending order (newest first)
    const sortedFastqFilePairs = session.fastqFilePairs
      ? session.fastqFilePairs.sort((a, b) => {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })
      : [];

    return {
      ...session,
      barcode: session.patient.barcode,
      fastqFilePairs: sortedFastqFilePairs.map((filePair) =>
        this.mapFastqFilePairToDto(filePair),
      ),
    };
  }

  async uploadFastqPair(
    id: number,
    files: Express.Multer.File[],
    user: AuthenticatedUser,
  ): Promise<{ message: string; fastqFilePairId: number }> {
    // Validate files
    if (!files || files.length !== 2) {
      throw new BadRequestException(
        'Exactly 2 FastQ files are required (R1 and R2)',
      );
    }

    // Validate file extensions for both files
    const allowedExtensions = ['.fastq', '.fq', '.fastq.gz', '.fq.gz'];
    for (const file of files) {
      const hasValidExtension = allowedExtensions.some((ext) =>
        file.originalname.toLowerCase().endsWith(ext),
      );
      if (!hasValidExtension) {
        throw new BadRequestException(
          `Invalid file type for ${file.originalname}. Only FastQ files (.fastq, .fq, .fastq.gz, .fq.gz) are allowed`,
        );
      }
    }

    const session = await this.labSessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    try {
      const timestamp = Date.now();

      // Upload both files to S3 and create FastqFile records
      const uploadPromises = files.map(async (file, index) => {
        const s3Key = `fastq/${id}/${timestamp}_${file.originalname}`;

        // Upload file to S3 (Cloudflare R2)
        const s3Url = await this.s3Service.uploadFile(
          S3Bucket.FASTQ_FILE,
          s3Key,
          file.buffer,
          file.mimetype,
        );

        // Create FastqFile record with S3 URL
        const fastqFile = this.fastqFileRepository.create({
          filePath: s3Url,
        });

        return await this.fastqFileRepository.save(fastqFile);
      });

      const [fastqFileR1, fastqFileR2] = await Promise.all(uploadPromises);

      // Create FastqFilePair to link the two files
      const fastqFilePair = this.fastqFilePairRepository.create({
        sessionId: id,
        fastqFileR1Id: fastqFileR1.id,
        fastqFileR2Id: fastqFileR2.id,
        createdBy: user.id,
        status: FastqFileStatus.UPLOADED,
      });

      const savedPair = await this.fastqFilePairRepository.save(fastqFilePair);

      return {
        message: 'FastQ file pair uploaded successfully',
        fastqFilePairId: savedPair.id,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to upload FastQ file pair: ${error.message}`,
      );
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
    fastqFilePairId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the FastQ file pair with related files
    const fastqFilePair = await this.fastqFilePairRepository.findOne({
      where: { id: fastqFilePairId },
      relations: {
        fastqFileR1: true,
        fastqFileR2: true,
      },
    });

    if (!fastqFilePair) {
      throw new NotFoundException(
        `FastQ file pair with id ${fastqFilePairId} not found`,
      );
    }

    try {
      // Delete both files from S3 if they exist
      const deletePromises: Promise<void>[] = [];

      if (fastqFilePair.fastqFileR1?.filePath) {
        const s3KeyR1 = this.s3Service.extractKeyFromUrl(
          fastqFilePair.fastqFileR1.filePath,
          S3Bucket.FASTQ_FILE,
        );
        deletePromises.push(
          this.s3Service.deleteFile(S3Bucket.FASTQ_FILE, s3KeyR1),
        );
      }

      if (fastqFilePair.fastqFileR2?.filePath) {
        const s3KeyR2 = this.s3Service.extractKeyFromUrl(
          fastqFilePair.fastqFileR2.filePath,
          S3Bucket.FASTQ_FILE,
        );
        deletePromises.push(
          this.s3Service.deleteFile(S3Bucket.FASTQ_FILE, s3KeyR2),
        );
      }

      // Wait for S3 deletions to complete
      await Promise.all(deletePromises);

      // Delete the FastQ file pair record FIRST (to remove foreign key constraints)
      await this.fastqFilePairRepository.remove(fastqFilePair);

      // Then delete the FastQ file records from database
      if (fastqFilePair.fastqFileR1) {
        await this.fastqFileRepository.remove(fastqFilePair.fastqFileR1);
      }
      if (fastqFilePair.fastqFileR2) {
        await this.fastqFileRepository.remove(fastqFilePair.fastqFileR2);
      }

      return {
        message: 'FastQ file pair and associated files deleted successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to delete FastQ file pair: ${error.message}`,
      );
    }
  }

  /**
   * Send a FastqFilePair to analysis
   */
  async sendToAnalysis(
    fastqFilePairId: number,
    analysisId: number,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    // Find the FastqFilePair
    const fastqFilePair = await this.fastqFilePairRepository.findOne({
      where: { id: fastqFilePairId },
      relations: {
        session: {
          patient: true, // Include patient to access barcode
          analysis: true, // Include analysis to check if already assigned
        },
      },
    });

    if (!fastqFilePair) {
      throw new NotFoundException(
        `FastQ file pair with id ${fastqFilePairId} not found`,
      );
    }

    // Check if the pair status allows sending to analysis
    if (fastqFilePair.status !== FastqFileStatus.UPLOADED) {
      throw new BadRequestException(
        `Cannot send FastQ file pair to analysis. Only pairs with status 'uploaded' can be sent. Current status: ${fastqFilePair.status}`,
      );
    }

    const session = fastqFilePair.session;
    if (!session) {
      throw new NotFoundException(`Session not found for FastQ file pair`);
    }

    let notificationReq: CreateNotificationReqDto = {
      title: `Chỉ định task phân tích`,
      message: `Bạn đã được chỉ định phân tích lần khám với mã labcode ${session.labcode} và mã barcode ${session.patient.barcode}`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.ACTION,
      subType: SubTypeNotification.ASSIGN,
      labcode: session.labcode,
      barcode: session.patient.barcode,
      senderId: user.id,
      receiverId: analysisId,
    };

    if (session.analysisId) {
      notificationReq.subType = SubTypeNotification.RESEND;
      notificationReq.message = `File Fastq pair #${fastqFilePair.id} của lần khám với mã labcode ${session.labcode} và mã barcode ${session.patient.barcode} đã được gửi mới`;
    }

    if (!session.analysisId && !analysisId) {
      return { message: 'Analysis ID is required' };
    } else if (!session.analysisId && analysisId) {
      session.analysisId = analysisId;
      await this.labSessionRepository.save(session);
    }

    try {
      // Update the status to WAIT_FOR_APPROVAL
      fastqFilePair.status = FastqFileStatus.WAIT_FOR_APPROVAL;
      await this.fastqFilePairRepository.save(fastqFilePair);
      await this.notificationService.createNotification(notificationReq);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to send FastQ file pair to analysis: ${error.message}`,
      );
    }

    return {
      message: 'FastQ file pair sent to analysis successfully',
    };
  }
}
