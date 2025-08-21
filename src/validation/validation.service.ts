import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
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
  PaginationQueryFilterGroupDto,
} from '../common/dto/pagination.dto';
import {
  ValidationSessionWithLatestEtlResponseDto,
  ValidationSessionDetailResponseDto,
} from './dto/validation-response.dto';
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
import { ClientProxy } from '@nestjs/microservices';
import {
  zMidnightToVNEndUtc,
  zMidnightToVNStartUtc,
} from 'src/utils/helperDate';

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
    @Inject('ETL_RESULT_SERVICE') private readonly client: ClientProxy,
  ) {}

  private formatLabcodeArray(labcodes: string[] | null | undefined): string {
    if (!labcodes || labcodes.length === 0) {
      return 'unknown';
    }
    return labcodes.join(', ');
  }

  async findAllPatientsWithLatestEtlResults(
    query: PaginationQueryFilterGroupDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ValidationSessionWithLatestEtlResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search = '',
      filterGroup,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      dateFrom,
      dateTo,
    } = query;

    // Create query builder to find labcodes where the user is assigned as validation
    const queryBuilder = this.labCodeLabSessionRepository
      .createQueryBuilder('labcode')
      .leftJoinAndSelect('labcode.labSession', 'labSession')
      .leftJoinAndSelect('labSession.patient', 'patient')
      .leftJoinAndSelect('labcode.assignment', 'assignment')
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
        'analysis.metadata',
      ])
      .where('assignment.validationId = :userId', { userId: user.id })
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

    if (dateFrom) {
      const fromUtc = zMidnightToVNStartUtc(dateFrom);
      queryBuilder.andWhere(
        `assignment.requestDateValidation >= (:fromUtc::timestamptz AT TIME ZONE 'UTC')`,
        { fromUtc },
      );
    }

    if (dateTo) {
      const toUtc = zMidnightToVNEndUtc(dateTo);
      queryBuilder.andWhere(
        `assignment.requestDateValidation <= (:toUtc::timestamptz AT TIME ZONE 'UTC')`,
        { toUtc },
      );
    }

    // Apply filterGroup functionality
    if (filterGroup) {
      switch (filterGroup) {
        case 'processing':
          // Include records where the latest ETL result has PROCESSING or WAIT_FOR_APPROVAL status
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM etl_results er 
              WHERE er.labcode_lab_session_id = labcode.id 
              AND er.id = (
                SELECT MAX(er2.id) 
                FROM etl_results er2 
                WHERE er2.labcode_lab_session_id = labcode.id
              )
              AND er.status = :processingStatuses
            )`,
            { processingStatuses: EtlResultStatus.WAIT_FOR_APPROVAL },
          );
          break;
        case 'rejected':
          // Include records where the latest ETL result has REJECTED status
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM etl_results er 
              WHERE er.labcode_lab_session_id = labcode.id 
              AND er.id = (
                SELECT MAX(er2.id) 
                FROM etl_results er2 
                WHERE er2.labcode_lab_session_id = labcode.id
              )
              AND er.status = :rejectedStatus
            )`,
            { rejectedStatus: EtlResultStatus.REJECTED },
          );
          break;
        case 'approved':
          // Include records where the latest ETL result has APPROVED status
          queryBuilder.andWhere(
            `EXISTS (
              SELECT 1 FROM etl_results er 
              WHERE er.labcode_lab_session_id = labcode.id 
              AND er.id = (
                SELECT MAX(er2.id) 
                FROM etl_results er2 
                WHERE er2.labcode_lab_session_id = labcode.id
              )
              AND er.status = :approvedStatus
            )`,
            { approvedStatus: EtlResultStatus.APPROVED },
          );
          break;
      }
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
          relations: { rejector: true, approver: true, fastqPair: true },
          select: {
            id: true,
            fastqFilePairId: true,
            htmlResult: true,
            excelResult: true,
            startTime: true,
            etlCompletedAt: true,
            status: true,
            reasonReject: true,
            reasonApprove: true,
            rejector: { id: true, name: true, email: true },
            approver: { id: true, name: true, email: true },
            fastqPair: { id: true, status: true, createdAt: true },
          },
          order: { id: 'DESC' },
        });

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
          analysis: labcode.assignment?.analysis || null,
          latestEtlResult: latestEtlResult
            ? {
                id: latestEtlResult.id,
                htmlResult: latestEtlResult.htmlResult,
                excelResult: latestEtlResult.excelResult,
                startTime: latestEtlResult.startTime,
                etlCompletedAt: latestEtlResult.etlCompletedAt,
                status: latestEtlResult.status,
                reasonReject: latestEtlResult.reasonReject,
                reasonApprove: latestEtlResult.reasonApprove,
                rejector: latestEtlResult.rejector
                  ? {
                      id: latestEtlResult.rejector.id,
                      name: latestEtlResult.rejector.name,
                      email: latestEtlResult.rejector.email,
                    }
                  : null,
                approver: latestEtlResult.approver
                  ? {
                      id: latestEtlResult.approver.id,
                      name: latestEtlResult.approver.name,
                      email: latestEtlResult.approver.email,
                    }
                  : null,
              }
            : null,
        };
      }),
    );

    return new PaginatedResponseDto(labcodesWithLatest, page, limit, total);
  }

  async findOne(id: number): Promise<ValidationSessionDetailResponseDto> {
    // Find the specific labcode session by ID
    const labcode = await this.labCodeLabSessionRepository.findOne({
      where: { id },
      relations: {
        labSession: {
          patient: true,
        },
        assignment: {
          doctor: true,
          analysis: true,
        },
        etlResults: {
          rejector: true,
          approver: true,
          fastqPair: true,
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

    return {
      id: labcode.id,
      labcode: [labcode.labcode], // Single labcode as array for consistency
      barcode: session.patient.barcode,
      createdAt: session.createdAt,
      requestDateValidation: labcode.assignment?.requestDateValidation || null,
      metadata: {}, // Empty object for backward compatibility
      patient: session.patient,
      doctor: labcode.assignment?.doctor || null,
      analysis: labcode.assignment?.analysis || null,
      etlResults: validEtlResults.map((result) => ({
        id: result.id,
        fastqFilePairId: result.fastqFilePairId,
        htmlResult: result.htmlResult,
        excelResult: result.excelResult,
        startTime: result.startTime,
        etlCompletedAt: result.etlCompletedAt,
        status: result.status,
        reasonReject: result.reasonReject,
        reasonApprove: result.reasonApprove,
        rejector: result.rejector
          ? {
              id: result.rejector.id,
              name: result.rejector.name,
              email: result.rejector.email,
            }
          : null,
        approver: result.approver
          ? {
              id: result.approver.id,
              name: result.approver.name,
              email: result.approver.email,
            }
          : null,
        fastqPair: result.fastqPair
          ? {
              id: result.fastqPair.id,
              status: result.fastqPair.status,
              createdAt: result.fastqPair.createdAt,
            }
          : null,
      })),
    };
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
          },
          assignment: true,
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
    const assignment = labcodeSession?.assignment;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    // Update ETL result status to REJECTED
    await this.etlResultRepository.update(etlResultId, {
      status: EtlResultStatus.REJECTED,
      reasonReject: reason,
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
          assignment: true,
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
          latestFastqFilePair.labcodeLabSession?.assignment?.analysisId!,
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
    reasonApprove: string | undefined,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
      relations: {
        labcodeLabSession: {
          labSession: {
            patient: true,
          },
          assignment: true,
        },
        fastqPair: {
          fastqFileR1: true,
          fastqFileR2: true,
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
    const assignment = labcodeSession?.assignment;
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

    if (reasonApprove) {
      updateData.reasonApprove = reasonApprove;
      updateData.approveBy = user.id;
    }

    await this.etlResultRepository.update(etlResultId, updateData);

    const labSession = await this.labSessionRepository.findOne({
      where: { id: labcodeSession?.labSessionId },
    });

    if (labSession) {
      labSession.finishedAt = new Date();
      await this.labSessionRepository.save(labSession);
    }

    // Emit message to ALF system with ETL result data
    if (etlResult.fastqPair?.fastqFileR1 && etlResult.fastqPair?.fastqFileR2) {
      try {
        // Determine test type from labcode
        const testType = this.inferTestTypeFromLabcode(labcode[0]);

        const alfData = {
          lab_session_id: labcodeSession?.labSessionId?.toString() || 'unknown',
          citizenId:
            labcodeSession?.labSession?.patient?.citizenId || 'unknown',
          info: {
            type: testType,
            commentResult: reasonApprove || '',
            etlCompletedAt: etlResult.etlCompletedQueueAt,
            excelResult: etlResult.excelResult,
            fastqR1Path: etlResult.fastqPair.fastqFileR1.filePath
              ? `s3://${this.s3Service.extractKeyFromUrl(etlResult.fastqPair.fastqFileR1.filePath, S3Bucket.FASTQ_FILE)}`
              : '',
            fastqR2Path: etlResult.fastqPair.fastqFileR2.filePath
              ? `s3://${this.s3Service.extractKeyFromUrl(etlResult.fastqPair.fastqFileR2.filePath, S3Bucket.FASTQ_FILE)}`
              : '',
            htmlResult: etlResult.htmlResult,
            labcode: labcode[0] || 'unknown',
          },
        };

        console.log(
          `[ValidationService] Attempting to emit ETL result data for labcode: ${labcode[0]}, barcode: ${barcode}`,
        );
        console.log(
          `[ValidationService] ETL data payload:`,
          JSON.stringify(alfData, null, 2),
        );

        this.client.emit('etl-result', alfData);

        console.log(
          `[ValidationService] ETL result data emitted successfully for labcode: ${labcode[0]}, barcode: ${barcode}`,
        );
      } catch (error) {
        console.error(
          `[ValidationService] Failed to emit ETL result data for labcode: ${labcode[0]}, barcode: ${barcode}`,
          error,
        );
      }
    } else {
      console.warn(
        `[ValidationService] Cannot emit ETL result data - missing fastq files for labcode: ${labcode[0]}, barcode: ${barcode}`,
      );
    }

    return { message: 'ETL result accepted successfully' };
  }

  /**
   * Infer test type from labcode pattern
   */
  private inferTestTypeFromLabcode(labcode: string): string {
    if (!labcode) return 'gene_mutation';

    // NIPT patterns (N3A, N4A, N5A, N24A, NCNVA)
    if (/^N(3|4|5|24|CNV)A/.test(labcode)) {
      return 'prenatal_screening';
    }

    // Hereditary cancer patterns (G2, G15, G20)
    if (/^G(2|15|20)/.test(labcode)) {
      return 'hereditary_cancer';
    }

    // Gene mutation patterns (O5, L8, LA, F8, FA, P8, PA)
    if (/^(O5|L8|LA|F8|FA|P8|PA)/.test(labcode)) {
      return 'gene_mutation';
    }

    // Default to gene_mutation for unknown patterns
    return 'gene_mutation';
  }
}
