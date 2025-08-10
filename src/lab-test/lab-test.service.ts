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
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
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
import { generateShortId } from 'src/utils/generateShortId';

@Injectable()
export class LabTestService {
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
    @InjectRepository(FastqFile)
    private fastqFileRepository: Repository<FastqFile>,
    @InjectRepository(FastqFilePair)
    private fastqFilePairRepository: Repository<FastqFilePair>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private formatLabcodeArray(labcodes: string[] | null | undefined): string {
    if (!labcodes || labcodes.length === 0) {
      return 'unknown';
    }
    return labcodes.join(', ');
  }

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

    // Create query builder to find labcodes where the user is assigned as lab testing
    const queryBuilder: SelectQueryBuilder<LabCodeLabSession> =
      this.labCodeLabSessionRepository
        .createQueryBuilder('labcode')
        .leftJoinAndSelect('labcode.labSession', 'labSession')
        .leftJoinAndSelect('labSession.patient', 'patient')
        .leftJoinAndSelect('labcode.assignment', 'assignment')
        .leftJoinAndSelect('assignment.doctor', 'doctor')
        .leftJoinAndSelect('assignment.analysis', 'analysis')
        .select([
          'labcode.id',
          'labcode.labcode',
          'labcode.packageType',
          'labcode.sampleType',
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
          'analysis.id',
          'analysis.name',
          'analysis.email',
        ])
        .where('assignment.labTestingId = :userId', { userId: user.id })
        .andWhere('labSession.typeLabSession = :type', { type: 'test' });

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

    // Apply filter functionality (filter by FastqFile status)
    if (filter && filter.status) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM fastq_file_pairs fp WHERE fp.labcode_lab_session_id = labcode.id AND fp.status = :status)',
        { status: filter.status },
      );
    }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [labcodes, total] = await queryBuilder.getManyAndCount();

    // For each labcode, get the latest FastQ file pair
    const labcodesWithLatestFastq = await Promise.all(
      labcodes.map(async (labcode) => {
        const latestFastqFilePair = await this.fastqFilePairRepository.findOne({
          where: { labcodeLabSessionId: labcode.id },
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
          id: labcode.id,
          labcode: [labcode.labcode],
          packageType: labcode.packageType || null,
          sampleType: labcode.sampleType || null,
          barcode: labcode.labSession.patient.barcode,
          requestDateLabTesting:
            labcode.assignment?.requestDateLabTesting || null,
          requestDateAnalysis: labcode.assignment?.requestDateAnalysis || null,
          requestDateValidation:
            labcode.assignment?.requestDateValidation || null,
          createdAt: labcode.labSession.createdAt,
          metadata: {},
          patient: labcode.labSession.patient,
          doctor: labcode.assignment?.doctor || null,
          analysis: labcode.assignment?.analysis || null,
          latestFastqFilePair: latestFastqFilePair
            ? this.mapFastqFilePairToDto(latestFastqFilePair)
            : null,
        };
      }),
    );

    return new PaginatedResponseDto(
      labcodesWithLatestFastq,
      page,
      limit,
      total,
    );
  }

  async findSessionById(
    id: number,
  ): Promise<LabSessionWithAllFastqResponseDto> {
    // Find the specific labcode session by its ID
    const labcodeSession = await this.labCodeLabSessionRepository.findOne({
      where: { id },
      relations: {
        labSession: {
          patient: true,
        },
        assignment: {
          doctor: true,
          analysis: true,
        },
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

    if (!labcodeSession) {
      throw new NotFoundException(`Labcode session with id ${id} not found`);
    }

    const session = labcodeSession.labSession;

    // Get all FastQ file pairs for this specific labcode session
    const allFastqFilePairs = labcodeSession.fastqFilePairs || [];

    // Sort FastQ file pairs by createdAt in descending order (newest first)
    const sortedFastqFilePairs = allFastqFilePairs.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return {
      id: labcodeSession.id,
      labcode: [labcodeSession.labcode], // Array containing this specific labcode
      barcode: session.patient.barcode,
      createdAt: session.createdAt,
      metadata: {}, // Empty object for backward compatibility
      patient: session.patient,
      doctor: labcodeSession.assignment?.doctor || null,
      analysis: labcodeSession.assignment?.analysis || null,
      fastqFilePairs: sortedFastqFilePairs.map((filePair) =>
        this.mapFastqFilePairToDto(filePair),
      ),
    };
  }

  async uploadFastqPair(
    id: number,
    files: Express.Multer.File[],
    user: AuthenticatedUser,
  ) {
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

    // Find the labcode session (assuming id is a labcode ID)
    const labcodeSession = await this.labCodeLabSessionRepository.findOne({
      where: { id },
      relations: {
        labSession: true,
      },
    });

    if (!labcodeSession) {
      throw new NotFoundException(`Labcode session with id ${id} not found`);
    }

    try {
      const shortId = generateShortId();

      // Upload both files to S3 and create FastqFile records
      const uploadPromises = files.map(async (file, index) => {
        const s3Key = `fastq/${labcodeSession.id}/${file.originalname}_${shortId}`;

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

      // Create FastqFilePair to link the two files with the labcode session
      const fastqFilePair = this.fastqFilePairRepository.create({
        labcodeLabSessionId: labcodeSession.id, // Link to labcode session instead of lab session
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
    console.log('Check haha0', fastqFilePairId, analysisId, user);
    // Find the FastqFilePair with its labcode session
    const fastqFilePair = await this.fastqFilePairRepository.findOne({
      where: { id: fastqFilePairId },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
          assignment: true,
        },
      },
    });

    console.log('Check fastqFilePair', fastqFilePair);

    if (!fastqFilePair) {
      throw new NotFoundException(
        `FastQ file pair with id ${fastqFilePairId} not found`,
      );
    }

    // Check if the pair status allows sending to analysis
    if (
      fastqFilePair.status !== FastqFileStatus.UPLOADED &&
      fastqFilePair.status !== FastqFileStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot send FastQ file pair to analysis. Only pairs with status 'uploaded' or 'rejected' can be sent. Current status: ${fastqFilePair.status}`,
      );
    }

    const labcodeSession = fastqFilePair.labcodeLabSession;
    if (!labcodeSession) {
      throw new NotFoundException(
        `Labcode session not found for FastQ file pair`,
      );
    }

    const session = labcodeSession.labSession;
    if (!session) {
      throw new NotFoundException(`Session not found for FastQ file pair`);
    }

    const formattedLabcode = labcodeSession.labcode;
    const notificationReq: CreateNotificationReqDto = {
      title: `Chỉ định task phân tích`,
      message: `Bạn đã được chỉ định phân tích lần khám với mã labcode ${formattedLabcode} và mã barcode ${session.patient.barcode}`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.ACTION,
      subType: SubTypeNotification.ASSIGN,
      labcode: [formattedLabcode],
      barcode: session.patient.barcode,
      senderId: user.id,
      receiverId: analysisId,
    };

    const labcodeAssignment = fastqFilePair.labcodeLabSession?.assignment;

    console.log('Check labcodeAssignment', labcodeAssignment);

    if (!analysisId) {
      return { message: 'Analysis ID is required' };
    }
    console.log('Check labcodeAssignment analysisId', analysisId);
    await this.assignLabSessionRepository.update(
      { labcodeLabSessionId: fastqFilePair.labcodeLabSession?.id },
      { analysisId: analysisId, requestDateAnalysis: new Date() },
    );

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
