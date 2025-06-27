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
  EtlResultDownloadResponseDto,
} from './dto/validation-response.dto';
import {
  RejectEtlResultDto,
  AcceptEtlResultDto,
} from './dto/validation-request.dto';
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

@Controller('validation')
@UseGuards(AuthGuard, RolesGuard)
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get('patients')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAllPatientsWithLatestEtlResults(
    @Query() query: PaginationQueryDto,
    @User() _user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<ValidationSessionWithLatestEtlResponseDto>> {
    return this.validationService.findAllPatientsWithLatestEtlResults(query);
  }

  @Get(':id')
  @AuthZ([Role.VALIDATION_TECHNICIAN])
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ValidationSessionWithLatestEtlResponseDto> {
    return this.validationService.findOne(id);
  }

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
      acceptDto.comment,
      user,
    );
  }
}
