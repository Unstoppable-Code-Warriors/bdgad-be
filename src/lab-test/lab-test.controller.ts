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
  UploadedFiles,
  UseGuards,
  BadRequestException,
  Delete,
  Put,
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
  PaginationQueryFilterGroupDto,
} from '../common/dto/pagination.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthZ } from '../auth/decorators/authz.decorator';
import { User } from '../auth/decorators/user.decorator';
import { AuthenticatedUser } from '../auth/types/user.types';
import { Role } from '../utils/constant';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { errorFastQ } from 'src/utils/errorRespones';

@Controller('lab-test')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class LabTestController {
  constructor(private readonly labTestService: LabTestService) {}

  @ApiTags('Lab Test - Sessions')
  @ApiOperation({ summary: 'Get all lab test sessions' })
  @Get('sessions')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
    example: 10,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term (applies to patient fields)',
  })
  @ApiQuery({
    name: 'searchField',
    required: false,
    type: String,
    description: 'Field to apply search on (default: fullName)',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Start date filter in YYYY-MM-DD format',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'End date filter in YYYY-MM-DD format',
  })
  @ApiQuery({
    name: 'filterGroup',
    required: false,
    type: String,
    description: 'Group by status (processing, rejected, approved)',
  })
  async findAllSession(
    @Query() query: PaginationQueryFilterGroupDto,
    @User() user: AuthenticatedUser,
  ): Promise<PaginatedResponseDto<LabSessionWithFastqResponseDto>> {
    console.log(user);
    return this.labTestService.findAllSession(query, user);
  }

  @ApiTags('Lab Test - Sessions')
  @ApiOperation({ summary: 'Get lab test session by id' })
  @Get('sessions/:id')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async findSessionById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LabSessionWithAllFastqResponseDto> {
    return this.labTestService.findSessionById(id);
  }

  // upload fastq file pair from form-data
  @ApiTags('Lab Test - Fastq files')
  @ApiOperation({ summary: 'Upload FastQ file pair (R1 and R2)' })
  @Post('session/:sessionId/fastq-pair')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a pair of FASTQ files (R1 and R2)',
    required: true,
    schema: {
      type: 'object',
      properties: {
        fastqFiles: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          minItems: 2,
          maxItems: 2,
        },
      },
      required: ['fastqFiles'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('fastqFiles', 2, {
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
            new BadRequestException(
              'Only FastQ files (.fastq, .fq, .fastq.gz, .fq.gz) are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit per FastQ file
      },
    }),
  )
  async uploadFastqPair(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @UploadedFiles() files: Express.Multer.File[],
    @User() user: AuthenticatedUser,
  ) {
    if (!files || files.length !== 2) {
      throw new BadRequestException(
        'Exactly 2 FastQ files are required (R1 and R2)',
      );
    }

    try {
      return this.labTestService.uploadFastqPair(sessionId, files, user);
    } catch (error) {
      if (error.message.includes('Only FastQ files')) {
        return errorFastQ.onlyFastQFiles;
      }
      if (error.message.includes('exceeds maximum allowed size')) {
        return errorFastQ.fileSizeExceeded;
      }
      throw error;
    }
  }

  // download fastq file - returns presigned URL
  @ApiTags('Lab Test - Fastq files')
  @ApiOperation({ summary: 'Download FastQ file' })
  @Get('fastq/:fastqFileId/download')
  @AuthZ([
    Role.LAB_TESTING_TECHNICIAN,
    Role.ANALYSIS_TECHNICIAN,
    Role.VALIDATION_TECHNICIAN,
    Role.DOCTOR,
  ])
  async downloadFastQ(
    @Param('fastqFileId', ParseIntPipe) fastqFileId: number,
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
  @ApiTags('Lab Test - Fastq files')
  @ApiOperation({ summary: 'Delete FastQ file' })
  @Delete('fastq/:fastqFilePairId')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async deleteFastQ(
    @Param('fastqFilePairId', ParseIntPipe) fastqFilePairId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.labTestService.deleteFastQ(fastqFilePairId, user);
    return {
      message: 'FastQ file deleted successfully',
    };
  }

  // send fastq file to analysis - updates status to 'wait_for_approval'
  @ApiTags('Lab Test - Fastq files')
  @ApiOperation({ summary: 'Send FastQ file to analysis' })
  @Post('fastq/:fastqFilePairId/analysis/:analysisId')
  @AuthZ([Role.LAB_TESTING_TECHNICIAN])
  async sendToAnalysis(
    @Param('fastqFilePairId', ParseIntPipe) fastqFilePairId: number,
    @Param('analysisId', ParseIntPipe) analysisId: number,
    @User() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.labTestService.sendToAnalysis(fastqFilePairId, analysisId, user);
    return {
      message: 'FastQ file sent to analysis successfully',
    };
  }
}
