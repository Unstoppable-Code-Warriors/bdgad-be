import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Body,
  Put,
} from '@nestjs/common';
import { ValidationService } from './validation.service';
import {
  ValidationSessionWithLatestEtlResponseDto,
  ValidationSessionDetailResponseDto,
  EtlResultDownloadResponseDto,
} from './dto/validation-response.dto';
import {
  RejectEtlResultDto,
  AcceptEtlResultDto,
} from './dto/validation-request.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  PaginationQueryFilterGroupDto,
} from '../common/dto/pagination.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthZ } from '../auth/decorators/authz.decorator';
import { User } from '../auth/decorators/user.decorator';
import { AuthenticatedUser } from '../auth/types/user.types';
import { Role } from '../utils/constant';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

@Controller('validation')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @ApiTags('Validation - Sessions')
  @Get('patients')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAllPatientsWithLatestEtlResults(
    @Query() query: PaginationQueryFilterGroupDto,
    @User() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ValidationSessionWithLatestEtlResponseDto>> {
    return this.validationService.findAllPatientsWithLatestEtlResults(
      query,
      user,
    );
  }

  @ApiTags('Validation - Sessions')
  @ApiOperation({ summary: 'Get a validation session' })
  @ApiParam({ name: 'id', type: Number })
  @Get(':id')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ValidationSessionDetailResponseDto> {
    return this.validationService.findOne(id);
  }

  @ApiTags('Validation - ETL Results')
  @ApiOperation({ summary: 'Download an ETL result' })
  @ApiParam({ name: 'etlResultId', type: Number })
  @Get('etl-result/:etlResultId/download')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  async downloadEtlResult(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
  ): Promise<EtlResultDownloadResponseDto> {
    const downloadUrl =
      await this.validationService.downloadEtlResult(etlResultId);
    const expiresIn = 3600; // 1 hour in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      downloadUrl,
      expiresIn,
      expiresAt,
    };
  }

  @ApiTags('Validation - ETL Results')
  @ApiOperation({ summary: 'Reject an ETL result' })
  @ApiParam({ name: 'etlResultId', type: Number })
  @ApiBody({
    type: RejectEtlResultDto,
    examples: { 'Reject ETL Result': { value: { reason: 'Sample reason' } } },
  })
  @Put('etl-result/:etlResultId/reject')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async rejectEtlResult(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @Body() rejectDto: RejectEtlResultDto,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.validationService.rejectEtlResult(
      etlResultId,
      rejectDto.reason,
      user,
    );
  }

  @ApiTags('Validation - ETL Results')
  @ApiOperation({ summary: 'Accept an ETL result' })
  @ApiParam({ name: 'etlResultId', type: Number })
  @Put('etl-result/:etlResultId/accept')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async acceptEtlResult(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @Body() acceptDto: AcceptEtlResultDto,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.validationService.acceptEtlResult(
      etlResultId,
      acceptDto.reasonApprove,
      user,
    );
  }
}
