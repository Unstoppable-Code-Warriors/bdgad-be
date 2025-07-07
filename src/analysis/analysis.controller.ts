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
import { ApiSecurity, ApiTags } from '@nestjs/swagger';

@Controller('analysis')
@UseGuards(AuthGuard, RolesGuard)
@ApiTags('Analysis')
@ApiSecurity('token')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('sessions')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAllAnalysisSessions(
    @Query() query: PaginationQueryDto,
    @User() _user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<AnalysisSessionWithLatestResponseDto>> {
    return this.analysisService.findAllAnalysisSessions(query);
  }

  @Get('sessions/:id')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async findAnalysisSessionById(
    @Param('id', ParseIntPipe) id: number,
    @User() _user: AuthenticatedUser,
  ): Promise<AnalysisSessionDetailResponseDto> {
    return this.analysisService.findAnalysisSessionById(id);
  }

  @Post('process/:fastqFileId')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async processAnalysis(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.processAnalysis(fastqFileId, user);
  }

  @Put('fastq/:fastqFileId/reject')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async rejectFastq(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
    @Body() rejectDto: RejectFastqDto,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.rejectFastq(
      fastqFileId,
      rejectDto.redoReason,
      user,
    );
  }

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

  @Post('etl-result/:etlResultId/send-to-validation')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async sendEtlResultToValidation(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.sendEtlResultToValidation(etlResultId, user);
  }

  @Post('etl-result/:etlResultId/retry')
  @AuthZ([Role.ANALYSIS_TECHNICIAN])
  async retryEtlProcess(
    @Param('etlResultId', ParseIntPipe) etlResultId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.analysisService.retryEtlProcess(etlResultId, user);
  }
}
