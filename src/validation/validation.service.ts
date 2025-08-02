import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LabSession } from '../entities/lab-session.entity';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
import {
  FastqFilePair,
  FastqFileStatus,
} from '../entities/fastq-file-pair.entity';
import { LabCodeLabSession } from '../entities/labcode-lab-session.entity';
import { AssignLabSession } from '../entities/assign-lab-session.entity';
import { AuthenticatedUser } from '../auth/types/user.types';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';
import { ValidationSessionWithLatestEtlResponseDto } from './dto/validation-response.dto';
import { S3Service } from '../utils/s3.service';
import {
  S3Bucket,
  TypeNotification,
  TypeTaskNotification,
  SubTypeNotification,
} from '../utils/constant';
import { In } from 'typeorm';
import { NotificationService } from 'src/notification/notification.service';
import { CreateNotificationReqDto } from 'src/notification/dto/create-notification.req.dto';

@Injectable()
export class ValidationService {
  constructor(
    @InjectRepository(LabSession)
    private labSessionRepository: Repository<LabSession>,
    @InjectRepository(LabCodeLabSession)
    private labCodeLabSessionRepository: Repository<LabCodeLabSession>,
    @InjectRepository(AssignLabSession)
    private assignLabSessionRepository: Repository<AssignLabSession>,
    @InjectRepository(EtlResult)
    private etlResultRepository: Repository<EtlResult>,
    @InjectRepository(FastqFilePair)
    private fastqFilePairRepository: Repository<FastqFilePair>,
    private s3Service: S3Service,
    private notificationService: NotificationService,
  ) {}

  private formatLabcodeArray(labcodes: string[] | null | undefined): string {
    if (!labcodes || labcodes.length === 0) {
      return 'unknown';
    }
    return labcodes.join(', ');
  }

  async findAllPatientsWithLatestEtlResults(
    query: PaginationQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ValidationSessionWithLatestEtlResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    // Create query builder to find labcodes where the user is assigned as validation
    const queryBuilder = this.labCodeLabSessionRepository
      .createQueryBuilder('labcode')
      .leftJoinAndSelect('labcode.labSession', 'labSession')
      .leftJoinAndSelect('labSession.patient', 'patient')
      .leftJoinAndSelect('labSession.assignment', 'assignment')
      .leftJoinAndSelect('assignment.doctor', 'doctor')
      .leftJoinAndSelect('assignment.analysis', 'analysis')
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
        'analysis.id',
        'analysis.name',
        'analysis.email',
        'analysis.metadata',
      ])
      .where('assignment.validationId = :userId', { userId: user.id })
      .andWhere('labSession.typeLabSession = :type', { type: 'test' })
      // Include labcodes that have ETL results with specific statuses
      .andWhere(
        'EXISTS (SELECT 1 FROM etl_results er WHERE er.labcode_lab_session_id = labcode.id AND er.status IN (:...allowedStatuses))',
        {
          allowedStatuses: [
            EtlResultStatus.WAIT_FOR_APPROVAL,
            EtlResultStatus.REJECTED,
            EtlResultStatus.APPROVED,
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

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [labcodes, total] = await queryBuilder.getManyAndCount();

    // For each labcode, get the latest ETL result
    const labcodesWithLatest = await Promise.all(
      labcodes.map(async (labcode) => {
        const latestEtlResult = await this.etlResultRepository.findOne({
          where: {
            labcodeLabSessionId: labcode.id,
            status: In([
              EtlResultStatus.WAIT_FOR_APPROVAL,
              EtlResultStatus.REJECTED,
              EtlResultStatus.APPROVED,
            ]),
          },
          relations: { rejector: true, commenter: true, fastqPair: true },
          select: {
            id: true,
            fastqFilePairId: true,
            resultPath: true,
            etlCompletedAt: true,
            status: true,
            redoReason: true,
            comment: true,
            rejector: { id: true, name: true, email: true },
            commenter: { id: true, name: true, email: true },
            fastqPair: { id: true, status: true, createdAt: true },
          },
          order: { id: 'DESC' },
        });

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
          analysis: labcode.labSession.assignment?.analysis || null,
          latestEtlResult: latestEtlResult
            ? {
                id: latestEtlResult.id,
                resultPath: latestEtlResult.resultPath,
                etlCompletedAt: latestEtlResult.etlCompletedAt,
                status: latestEtlResult.status,
                redoReason: latestEtlResult.redoReason,
                comment: latestEtlResult.comment,
                rejector: latestEtlResult.rejector
                  ? {
                      id: latestEtlResult.rejector.id,
                      name: latestEtlResult.rejector.name,
                      email: latestEtlResult.rejector.email,
                    }
                  : undefined,
                commenter: latestEtlResult.commenter
                  ? {
                      id: latestEtlResult.commenter.id,
                      name: latestEtlResult.commenter.name,
                      email: latestEtlResult.commenter.email,
                    }
                  : undefined,
              }
            : null,
        };
      }),
    );

    return new PaginatedResponseDto(labcodesWithLatest, page, limit, total);
  }

  async findOne(
    id: number,
  ): Promise<ValidationSessionWithLatestEtlResponseDto> {
    // Find the specific labcode session by ID
    const labcode = await this.labCodeLabSessionRepository.findOne({
      where: { id },
      relations: {
        labSession: {
          patient: true,
          assignment: {
            doctor: true,
            analysis: true,
          },
        },
        etlResults: {
          rejector: true,
          commenter: true,
        },
      },
    });

    if (!labcode) {
      throw new NotFoundException('Validation session not found');
    }

    const session = labcode.labSession;

    // Find the latest ETL result for this labcode
    const validEtlResults = (labcode.etlResults || []).filter((result) =>
      [
        EtlResultStatus.WAIT_FOR_APPROVAL,
        EtlResultStatus.REJECTED,
        EtlResultStatus.APPROVED,
      ].includes(result.status),
    );

    // Sort by ID descending to get the latest
    validEtlResults.sort((a, b) => b.id - a.id);
    const latestEtlResult = validEtlResults[0] || null;

    return {
      id: labcode.id,
      labcode: [labcode.labcode], // Single labcode as array for consistency
      barcode: session.patient.barcode,
      requestDate: labcode.createdAt, // Use labcode creation date as request date
      createdAt: session.createdAt,
      metadata: {}, // Empty object for backward compatibility
      patient: session.patient,
      doctor: session.assignment?.doctor || null,
      analysis: session.assignment?.analysis || null,
      latestEtlResult: latestEtlResult
        ? {
            id: latestEtlResult.id,
            resultPath: latestEtlResult.resultPath,
            etlCompletedAt: latestEtlResult.etlCompletedAt,
            status: latestEtlResult.status,
            redoReason: latestEtlResult.redoReason,
            comment: latestEtlResult.comment,
            rejector: latestEtlResult.rejector
              ? {
                  id: latestEtlResult.rejector.id,
                  name: latestEtlResult.rejector.name,
                  email: latestEtlResult.rejector.email,
                }
              : undefined,
            commenter: latestEtlResult.commenter
              ? {
                  id: latestEtlResult.commenter.id,
                  name: latestEtlResult.commenter.name,
                  email: latestEtlResult.commenter.email,
                }
              : undefined,
          }
        : null,
    };
  }

  async downloadEtlResult(etlResultId: number): Promise<string> {
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
    });

    if (!etlResult) {
      throw new NotFoundException('ETL result not found');
    }

    // Check if ETL result is in a valid status for download
    const validStatuses = [
      EtlResultStatus.COMPLETED,
      EtlResultStatus.WAIT_FOR_APPROVAL,
      EtlResultStatus.REJECTED,
      EtlResultStatus.APPROVED,
    ];

    if (!validStatuses.includes(etlResult.status)) {
      throw new ForbiddenException(
        'ETL result cannot be downloaded in current status',
      );
    }

    // Use resultPath directly as the key (it's already stored as a key, not a full URL)
    return this.s3Service.generatePresigned(
      S3Bucket.ANALYSIS_RESULTS,
      etlResult.resultPath,
    );
  }

  async rejectEtlResult(
    etlResultId: number,
    reason: string,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const notificationReqs: CreateNotificationReqDto[] = [];
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
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
      throw new NotFoundException('ETL result not found');
    }

    // Check if ETL result is in WAIT_FOR_APPROVAL status
    if (etlResult.status !== EtlResultStatus.WAIT_FOR_APPROVAL) {
      throw new ForbiddenException(
        'ETL result can only be rejected when waiting for approval',
      );
    }

    const labcodeSession = etlResult.labcodeLabSession;
    const assignment = labcodeSession?.labSession?.assignment;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    // Update ETL result status to REJECTED
    await this.etlResultRepository.update(etlResultId, {
      status: EtlResultStatus.REJECTED,
      redoReason: reason,
      rejectBy: user.id,
    });

    notificationReqs.push({
      title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
      message: `Kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} đã bị từ chối`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.REJECT,
      labcode: labcode,
      barcode: barcode,
      senderId: user.id,
      receiverId: assignment?.analysisId!,
    });

    // Find and update the latest FastQ file pair status to WAIT_FOR_APPROVAL
    const latestFastqFilePair = await this.fastqFilePairRepository.findOne({
      where: { labcodeLabSessionId: etlResult.labcodeLabSessionId },
      order: { createdAt: 'DESC' },
      relations: {
        labcodeLabSession: {
          labSession: {
            assignment: true,
          },
        },
        creator: true,
      },
    });

    if (latestFastqFilePair) {
      await this.fastqFilePairRepository.update(latestFastqFilePair.id, {
        status: FastqFileStatus.WAIT_FOR_APPROVAL,
      });
      notificationReqs.push({
        title: `Trạng thái file Fastq pair #${latestFastqFilePair.id}.`,
        message: `File Fastq pair #${latestFastqFilePair.id} của lần khám với Barcode ${barcode} đang chờ được duyệt`,
        taskType: TypeTaskNotification.LAB_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.RETRY,
        labcode: labcode,
        barcode: barcode,
        senderId:
          latestFastqFilePair.labcodeLabSession?.labSession?.assignment
            ?.analysisId!,
        receiverId: latestFastqFilePair.createdBy,
      });
    }

    await this.notificationService.createNotifications({
      notifications: notificationReqs,
    });
    return { message: 'ETL result rejected successfully' };
  }

  async acceptEtlResult(
    etlResultId: number,
    comment: string | undefined,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
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
      throw new NotFoundException('ETL result not found');
    }

    // Check if ETL result is in WAIT_FOR_APPROVAL status
    if (etlResult.status !== EtlResultStatus.WAIT_FOR_APPROVAL) {
      throw new ForbiddenException(
        'ETL result can only be accepted when waiting for approval',
      );
    }

    const labcodeSession = etlResult.labcodeLabSession;
    const assignment = labcodeSession?.labSession?.assignment;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    // Update ETL result status to APPROVED
    const updateData: Partial<EtlResult> = {
      status: EtlResultStatus.APPROVED,
    };

    await this.notificationService.createNotification({
      title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
      message: `Kết quả ETL #${etlResult.id} của lần khám với Barcode ${barcode} đã được duyệt`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.ACCEPT,
      labcode: labcode,
      barcode: barcode,
      senderId: user.id,
      receiverId: assignment?.analysisId!,
    });

    if (comment) {
      updateData.comment = comment;
      updateData.commentBy = user.id;
    }

    await this.etlResultRepository.update(etlResultId, updateData);

    const labSession = await this.labSessionRepository.findOne({
      where: { id: labcodeSession?.labSessionId },
    });

    if (labSession) {
      labSession.finishedAt = new Date();
      await this.labSessionRepository.save(labSession);
    }

    return { message: 'ETL result accepted successfully' };
  }
}
