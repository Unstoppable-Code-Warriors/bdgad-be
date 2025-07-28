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

    // Create query builder for lab sessions that have ETL results with specific statuses
    const queryBuilder = this.labSessionRepository
      .createQueryBuilder('labSession')
      .leftJoinAndSelect('labSession.patient', 'patient')
      .leftJoinAndSelect('labSession.doctor', 'doctor')
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
        'doctor.id',
        'doctor.name',
        'doctor.email',
        'doctor.metadata',
      ])
      // Include sessions that have ETL results with WAIT_FOR_APPROVAL, REJECTED, or APPROVED status
      .innerJoin(
        'labSession.etlResults',
        'etlResult',
        'etlResult.status IN (:...allowedStatuses)',
        {
          allowedStatuses: [
            EtlResultStatus.WAIT_FOR_APPROVAL,
            EtlResultStatus.REJECTED,
            EtlResultStatus.APPROVED,
          ],
        },
      )
      .where('labSession.validationId = :userId', { userId: user.id })
      .andWhere('labSession.typeLabSession = :type', { type: 'test' });

    // Apply search functionality (search by labcode and barcode)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        '(EXISTS (SELECT 1 FROM unnest(labSession.labcode) AS lc WHERE LOWER(lc) LIKE :search) OR LOWER(patient.barcode) LIKE :search)',
        { search: searchTerm },
      );
    }

    // Apply dynamic sorting
    // if (sortBy && sortOrder) {
    //   const allowedSortFields = {
    //     id: 'labSession.id',
    //     labcode: 'labSession.labcode',
    //     barcode: 'patient.barcode',
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
    //     // Default sort by ETL status priority then by creation date
    //     queryBuilder
    //       .addSelect('etlResult.status', 'etlStatus')
    //       .orderBy(
    //         `CASE etlResult.status
    //          WHEN '${EtlResultStatus.WAIT_FOR_APPROVAL}' THEN 1
    //          WHEN '${EtlResultStatus.REJECTED}' THEN 2
    //          WHEN '${EtlResultStatus.APPROVED}' THEN 3
    //          ELSE 4 END`,
    //       )
    //       .addOrderBy('labSession.createdAt', 'DESC');
    //   }
    // } else {
    //   // Default sort by ETL status priority then by creation date
    //   queryBuilder
    //     .addSelect('etlResult.status', 'etlStatus')
    //     .orderBy(
    //       `CASE etlResult.status
    //        WHEN '${EtlResultStatus.WAIT_FOR_APPROVAL}' THEN 1
    //        WHEN '${EtlResultStatus.REJECTED}' THEN 2
    //        WHEN '${EtlResultStatus.APPROVED}' THEN 3
    //        ELSE 4 END`,
    //     )
    //     .addOrderBy('labSession.createdAt', 'DESC');
    // }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Execute query
    const [sessions, total] = await queryBuilder.getManyAndCount();

    // For each session, get the latest ETL result
    const sessionsWithLatest = await Promise.all(
      sessions.map(async (session) => {
        const latestEtlResult = await this.etlResultRepository.findOne({
          where: {
            sessionId: session.id,
            status: In([
              EtlResultStatus.WAIT_FOR_APPROVAL,
              EtlResultStatus.REJECTED,
              EtlResultStatus.APPROVED,
            ]),
          },
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
          order: { id: 'DESC' },
        });

        return {
          id: session.id,
          labcode: session.labcode,
          barcode: session.patient.barcode,
          requestDate: session.requestDate,
          createdAt: session.createdAt,
          metadata: session.metadata,
          patient: {
            id: session.patient.id,
            fullName: session.patient.fullName,
            dateOfBirth: session.patient.dateOfBirth,
            phone: session.patient.phone,
            address: session.patient.address,
            citizenId: session.patient.citizenId,
            createdAt: session.patient.createdAt,
          },
          doctor: {
            id: session.doctor.id,
            name: session.doctor.name,
            email: session.doctor.email,
            metadata: session.doctor.metadata,
          },
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

    return {
      data: sessionsWithLatest,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      success: true,
      timestamp: new Date().toISOString(),
    };
  }

  async findOne(
    id: number,
  ): Promise<ValidationSessionWithLatestEtlResponseDto> {
    const validation = await this.labSessionRepository.findOne({
      where: { id },
      relations: { patient: true, doctor: true, etlResults: true },
    });

    if (!validation) {
      throw new NotFoundException('Validation session not found');
    }

    const latestEtlResult = await this.etlResultRepository.findOne({
      where: {
        sessionId: id,
        status: In([
          EtlResultStatus.WAIT_FOR_APPROVAL,
          EtlResultStatus.REJECTED,
          EtlResultStatus.APPROVED,
        ]),
      },
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
      order: { id: 'DESC' },
    });

    return {
      ...validation,
      barcode: validation.patient.barcode,
      latestEtlResult,
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
        session: { patient: true },
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

    // Update ETL result status to REJECTED
    await this.etlResultRepository.update(etlResultId, {
      status: EtlResultStatus.REJECTED,
      redoReason: reason,
      rejectBy: user.id,
    });
    notificationReqs.push({
      title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
      message: `Kết quả ETL #${etlResult.id}  của lần khám với Barcode ${etlResult.session.patient.barcode} đã bị từ chối`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.REJECT,
      labcode: etlResult.session.labcode || [],
      barcode: etlResult.session.patient.barcode,
      senderId: user.id,
      receiverId: etlResult.session.analysisId!,
    });

    // Find and update the latest FastQ file pair status to WAIT_FOR_APPROVAL
    const latestFastqFilePair = await this.fastqFilePairRepository.findOne({
      where: { sessionId: etlResult.sessionId },
      order: { createdAt: 'DESC' },
      relations: { session: true, creator: true },
    });

    if (latestFastqFilePair) {
      await this.fastqFilePairRepository.update(latestFastqFilePair.id, {
        status: FastqFileStatus.WAIT_FOR_APPROVAL,
      });
      notificationReqs.push({
        title: `Trạng thái file Fastq pair #${latestFastqFilePair.id}.`,
        message: `File Fastq pair #${latestFastqFilePair.id} của lần khám với Barcode ${etlResult.session.patient.barcode} đang chờ được duyệt`,
        taskType: TypeTaskNotification.LAB_TASK,
        type: TypeNotification.PROCESS,
        subType: SubTypeNotification.RETRY,
        labcode: etlResult.session.labcode || [],
        barcode: etlResult.session.patient.barcode,
        senderId: latestFastqFilePair.session.analysisId!,
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
        session: { patient: true },
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

    // Update ETL result status to APPROVED
    const updateData: Partial<EtlResult> = {
      status: EtlResultStatus.APPROVED,
    };
    await this.notificationService.createNotification({
      title: `Trạng thái file kết quả ETL #${etlResult.id}.`,
      message: `Kết quả ETL #${etlResult.id}  của lần khám với Barcode ${etlResult.session.patient.barcode} đã được duyệt`,
      taskType: TypeTaskNotification.ANALYSIS_TASK,
      type: TypeNotification.PROCESS,
      subType: SubTypeNotification.ACCEPT,
      labcode: etlResult.session.labcode || [],
      barcode: etlResult.session.patient.barcode,
      senderId: user.id,
      receiverId: etlResult.session.analysisId!,
    });

    if (comment) {
      updateData.comment = comment;
      updateData.commentBy = user.id;
    }

    await this.etlResultRepository.update(etlResultId, updateData);
    const labSession = await this.labSessionRepository.findOne({
      where: { id: etlResult?.sessionId },
    });

    if (labSession) {
      labSession.finishedAt = new Date();
      await this.labSessionRepository.save(labSession);
    }

    return { message: 'ETL result accepted successfully' };
  }
}
