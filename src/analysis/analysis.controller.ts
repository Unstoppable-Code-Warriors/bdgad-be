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
import { AnalysisService } from './analysis.service';
import {
  AnalysisSessionWithLatestResponseDto,
  AnalysisSessionDetailResponseDto,
  EtlResultDownloadResponseDto,
} from './dto/analysis-response.dto';
import { RejectFastqDto } from './dto/analysis-request.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
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
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

@Controller('analysis')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @ApiTags('Analysis - Sessions')
  @ApiOperation({ summary: 'Find All Analysis Sessions' })
  @Get('sessions')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description:
      'Start date filter in YYYY-MM-DD format (filters by requestDateAnalysis)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description:
      'End date filter in YYYY-MM-DD format (filters by requestDateAnalysis)',
  })
  @ApiQuery({
    name: 'filterFastq',
    required: false,
    type: String,
    description:
      'Filter by latest FastQ file pair status (wait_for_approval, approved, rejected)',
  })
  @ApiQuery({
    name: 'filterEtl',
    required: false,
    type: String,
    description:
      'Filter by latest ETL result status (not_yet_processing,processing, completed, failed, wait_for_approval, rejected, approved)',
  })
  async findAllAnalysisSessions(
    @Query() query: PaginationQueryDto,
    @User() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<AnalysisSessionWithLatestResponseDto>> {
    return this.analysisService.findAllAnalysisSessions(query, user);
  }

  @ApiTags('Analysis - Sessions')
  @ApiOperation({ summary: 'Find Analysis Session By Id' })
  @Get('sessions/:id')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async findAnalysisSessionById(
    @Param('id', ParseIntPipe) id: number,
    @User() _user: AuthenticatedUser,
  ): Promise<AnalysisSessionDetailResponseDto> {
    return this.analysisService.findAnalysisSessionById(id);
  }

  @ApiTags('Analysis - Process')
  @ApiOperation({ summary: 'Process Analysis' })
  @Post('process/:fastqFilePairId')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async processAnalysis(
    @Param('fastqFilePairId', ParseIntPipe) fastqFilePairId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.processAnalysis(fastqFilePairId, user);
  }

  @ApiTags('Analysis - Reject')
  @ApiOperation({ summary: 'Reject Analysis' })
  @Put('fastq/:fastqFilePairId/reject')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  @ApiBody({
    type: RejectFastqDto,
    description: 'Reason for rejecting the FASTQ file pair',
    examples: {
      example1: {
        summary: 'Example of rejection reason',
        value: { redoReason: 'Insufficient quality of the FASTQ file pair' },
      },
    },
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async rejectFastq(
    @Param('fastqFilePairId', ParseIntPipe) fastqFilePairId: number,
    @Body() rejectDto: RejectFastqDto,
    @User() user: AuthenticatedUser,
  ) {
    return this.analysisService.rejectFastq(
      fastqFilePairId,
      rejectDto.redoReason,
      user,
    );
  }

  @ApiTags('Analysis - ETL Results')
  @ApiOperation({ summary: 'Download ETL Result' })
  @Get('etl-result/:etlResultId/download')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async downloadEtlResult(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
  ): Promise<EtlResultDownloadResponseDto> {
    const downloadUrl =
      await this.analysisService.downloadEtlResult(etlResultId);
    const expiresIn = 3600; // 1 hour in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      downloadUrl,
      expiresIn,
      expiresAt,
    };
  }

  @ApiTags('Analysis - ETL Results')
  @ApiOperation({ summary: 'Send ETL Result To Validation' })
  @Post('etl-result/:etlResultId/validation/:validationId')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async sendEtlResultToValidation(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @Param('validationId', ParseIntPipe) validationId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.sendEtlResultToValidation(
      etlResultId,
      user,
      validationId,
    );
  }

  @ApiTags('Analysis - ETL Results')
  @ApiOperation({ summary: 'Retry ETL Process' })
  @Post('etl-result/:etlResultId/retry')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async retryEtlProcess(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.retryEtlProcess(etlResultId, user);
  }
}
