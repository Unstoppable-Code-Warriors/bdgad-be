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
  BadRequestException,
  Delete,
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
import { ApiSecurity } from '@nestjs/swagger';

@Controller('lab-test')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
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
    return this.labTestService.findAllSession(query, user);
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
  @UseInterceptors(
    FileInterceptor('fastq', {
      fileFilter: (req, file, cb) => {
        // Accept FastQ file types
        const allowedMimeTypes = [
          'text/plain', // .fastq, .fq
          'application/octet-stream', // .fastq.gz, .fq.gz
          'application/gzip', // .gz files
          'application/x-gzip', // alternative gzip mime type
        ];

        const allowedExtensions = ['.fastq', '.fq', '.fastq.gz', '.fq.gz'];
        const hasValidExtension = allowedExtensions.some((ext) =>
          file.originalname.toLowerCase().endsWith(ext),
        );

        if (allowedMimeTypes.includes(file.mimetype) || hasValidExtension) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only FastQ files (.fastq, .fq, .fastq.gz, .fq.gz) are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for FastQ files
      },
    }),
  )
  async uploadFastQ(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @User() user: AuthenticatedUser,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException(
        'No file provided. Please select a FastQ file to upload.',
      );
    }

    try {
      return this.labTestService.uploadFastQ(id, file, user);
    } catch (error) {
      if (error.message.includes('Only FastQ files')) {
        throw new BadRequestException(error.message);
      }
      if (error.message.includes('exceeds maximum allowed size')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
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

  // delete fastq file - only allowed when status is 'uploaded'
  @Delete('fastq/:fastqFileId')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async deleteFastQ(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.labTestService.deleteFastQ(fastqFileId, user);
    return {
      message: 'FastQ file deleted successfully',
    };
  }

  // send fastq file to analysis - updates status to 'wait_for_approval'
  @Post('fastq/:fastqFileId/send-to-analysis')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async sendToAnalysis(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.labTestService.sendToAnalysis(fastqFileId, user);
    return {
      message: 'FastQ file sent to analysis successfully',
    };
  }
}
