import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  Param,
  ParseIntPipe,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { LabTestService } from './lab-test.service';
import {
  LabSessionWithFastqResponseDto,
  LabSessionWithAllFastqResponseDto,
  FastqDownloadResponseDto,
} from './dto/lab-session-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthZ } from '../auth/decorators/authz.decorator';
import { User } from '../auth/decorators/user.decorator';
import { AuthenticatedUser } from '../auth/types/user.types';
import { Role } from '../utils/constant';

@Controller('lab-test')
@UseGuards(AuthGuard, RolesGuard)
export class LabTestController {
  constructor(private readonly labTestService: LabTestService) {}

  @Get('sessions')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAllSession(
    @Query() query: PaginationQueryDto,
    @User() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<LabSessionWithFastqResponseDto>> {
    console.log(user);
    return this.labTestService.findAllSession(query);
  }

  @Get('sessions/:id')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async findSessionById(
    @Param('id', ParseIntPipe) id: number,
    @User() user: AuthenticatedUser,
  ): Promise<LabSessionWithAllFastqResponseDto> {
    return this.labTestService.findSessionById(id);
  }

  // upload fastq file from form-data
  @Post('session/:id/fastq')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  @UseInterceptors(FileInterceptor('fastq'))
  async uploadFastQ(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @User() user: AuthenticatedUser,
  ): Promise<void> {
    return this.labTestService.uploadFastQ(id, file, user);
  }

  // download fastq file - returns presigned URL
  @Get('fastq/:fastqFileId/download')
  @AuthZ([
    Role.LAB_TESTING_TECHNICIAN,
    Role.ANALYSIS_TECHNICIAN,
    Role.VALIDATION_TECHNICIAN,
    Role.DOCTOR,
  ])
  async downloadFastQ(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
    @User() user: AuthenticatedUser,
  ): Promise<FastqDownloadResponseDto> {
    const downloadUrl = await this.labTestService.downloadFastQ(fastqFileId);
    const expiresIn = 3600; // 1 hour in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      downloadUrl,
      expiresIn,
      expiresAt,
    };
  }
}
