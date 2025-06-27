import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LabSession } from '../entities/lab-session.entity';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
import { AuthenticatedUser } from '../auth/types/user.types';
import {
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';
import { ValidationSessionWithLatestEtlResponseDto } from './dto/validation-response.dto';
import { S3Service } from '../utils/s3.service';
import { S3Bucket } from '../utils/constant';

@Injectable()
export class ValidationService {
  constructor(
    @InjectRepository(LabSession)
    private labSessionRepository: Repository<LabSession>,
    @InjectRepository(EtlResult)
    private etlResultRepository: Repository<EtlResult>,
    private s3Service: S3Service,
  ) {}

  async findAllPatientsWithLatestEtlResults(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<ValidationSessionWithLatestEtlResponseDto>> {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;
    const offset = (page - 1) * limit;

    // Build base query
    let queryBuilder = this.labSessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.patient', 'patient')
      .leftJoinAndSelect('session.doctor', 'doctor')
      .leftJoinAndSelect('session.etlResults', 'etlResult')
      .leftJoinAndSelect('etlResult.rejector', 'rejector')
      .leftJoinAndSelect('etlResult.commenter', 'commenter');

    // Filter by ETL result status priority: WAIT_FOR_APPROVAL, REJECTED, APPROVED
    queryBuilder = queryBuilder.where('etlResult.status IN (:...statuses)', {
      statuses: [
        EtlResultStatus.WAIT_FOR_APPROVAL,
        EtlResultStatus.REJECTED,
        EtlResultStatus.APPROVED,
      ],
    });

    // Add search functionality
    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(patient.fullName ILIKE :search OR patient.personalId ILIKE :search OR session.labcode ILIKE :search OR session.barcode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Add sorting
    const allowedSortColumns = [
      'createdAt',
      'requestDate',
      'labcode',
      'barcode',
    ];
    const column = allowedSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder = queryBuilder.orderBy(
      `session.${column}`,
      sortOrder as 'ASC' | 'DESC',
    );

    // Add secondary sort by ETL result status priority
    queryBuilder = queryBuilder.addOrderBy(
      `CASE 
        WHEN etlResult.status = '${EtlResultStatus.WAIT_FOR_APPROVAL}' THEN 1
        WHEN etlResult.status = '${EtlResultStatus.REJECTED}' THEN 2
        WHEN etlResult.status = '${EtlResultStatus.APPROVED}' THEN 3
        ELSE 4
      END`,
      'ASC',
    );

    // Add sorting by ETL result ID to get the latest one
    queryBuilder = queryBuilder.addOrderBy('etlResult.id', 'DESC');

    // Get total count (using a separate count query to avoid issues)
    const countQuery = this.labSessionRepository
      .createQueryBuilder('session')
      .leftJoin('session.etlResults', 'etlResult')
      .where('etlResult.status IN (:...statuses)', {
        statuses: [
          EtlResultStatus.WAIT_FOR_APPROVAL,
          EtlResultStatus.REJECTED,
          EtlResultStatus.APPROVED,
        ],
      });

    if (search) {
      countQuery.leftJoin('session.patient', 'patient');
      countQuery.andWhere(
        '(patient.fullName ILIKE :search OR patient.personalId ILIKE :search OR session.labcode ILIKE :search OR session.barcode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const totalItems = await countQuery.getCount();

    // Apply pagination
    const sessions = await queryBuilder.skip(offset).take(limit).getMany();

    // Process the results to get only the latest ETL result per session
    const sessionMap = new Map();
    sessions.forEach((session) => {
      if (!sessionMap.has(session.id)) {
        // Get the latest ETL result (first one due to ordering)
        const latestEtlResult = session.etlResults
          .filter((etl) =>
            [
              EtlResultStatus.WAIT_FOR_APPROVAL,
              EtlResultStatus.REJECTED,
              EtlResultStatus.APPROVED,
            ].includes(etl.status),
          )
          .sort((a, b) => b.id - a.id)[0];

        sessionMap.set(session.id, {
          ...session,
          etlResults: latestEtlResult ? [latestEtlResult] : [],
        });
      }
    });

    const processedSessions = Array.from(sessionMap.values());

    // Transform data
    const data = processedSessions.map((session) => ({
      id: session.id,
      labcode: session.labcode,
      barcode: session.barcode,
      requestDate: session.requestDate,
      createdAt: session.createdAt,
      metadata: session.metadata,
      patient: {
        id: session.patient.id,
        fullName: session.patient.fullName,
        dateOfBirth: session.patient.dateOfBirth,
        phone: session.patient.phone,
        address: session.patient.address,
        personalId: session.patient.personalId,
        healthInsuranceCode: session.patient.healthInsuranceCode,
        createdAt: session.patient.createdAt,
      },
      doctor: {
        id: session.doctor.id,
        name: session.doctor.name,
        email: session.doctor.email,
        metadata: session.doctor.metadata,
      },
      latestEtlResult: session.etlResults?.[0]
        ? {
            id: session.etlResults[0].id,
            resultPath: session.etlResults[0].resultPath,
            etlCompletedAt: session.etlResults[0].etlCompletedAt,
            status: session.etlResults[0].status,
            redoReason: session.etlResults[0].redoReason,
            comment: session.etlResults[0].comment,
            rejector: session.etlResults[0].rejector
              ? {
                  id: session.etlResults[0].rejector.id,
                  name: session.etlResults[0].rejector.name,
                  email: session.etlResults[0].rejector.email,
                }
              : undefined,
            commenter: session.etlResults[0].commenter
              ? {
                  id: session.etlResults[0].commenter.id,
                  name: session.etlResults[0].commenter.name,
                  email: session.etlResults[0].commenter.email,
                }
              : undefined,
          }
        : null,
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      success: true,
      timestamp: new Date().toISOString(),
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

    // Extract key from result path and generate presigned URL
    const key = this.s3Service.extractKeyFromUrl(
      etlResult.resultPath,
      S3Bucket.ANALYSIS_RESULTS,
    );
    return this.s3Service.generatePresignedDownloadUrl(
      S3Bucket.ANALYSIS_RESULTS,
      key,
    );
  }

  async rejectEtlResult(
    etlResultId: number,
    reason: string,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
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

    return { message: 'ETL result rejected successfully' };
  }

  async acceptEtlResult(
    etlResultId: number,
    comment: string | undefined,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const etlResult = await this.etlResultRepository.findOne({
      where: { id: etlResultId },
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

    if (comment) {
      updateData.comment = comment;
      updateData.commentBy = user.id;
    }

    await this.etlResultRepository.update(etlResultId, updateData);

    return { message: 'ETL result accepted successfully' };
  }
}
