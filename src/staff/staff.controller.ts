import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Param,
  Get,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  Body,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { StaffService } from './staff.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthZ } from '../auth/decorators/authz.decorator';
import { User } from '../auth/decorators/user.decorator';
import { AuthenticatedUser } from '../auth/types/user.types';
import { Role } from '../utils/constant';
import { ApiBody, ApiConsumes, ApiSecurity, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreatePatientDto } from './dtos/create-patient-dto.req';

@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('/upload-info')
  @AuthZ([Role.STAFF])
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'medicalTestRequisition', maxCount: 1 },
        { name: 'salesInvoice', maxCount: 1 },
      ],
      {
        fileFilter: (req, file, cb) => {
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            cb(new Error('Only image files are allowed'), false);
          }
        },
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB limit
        },
      },
    ),
  )
  async uploadInfo(
    @UploadedFiles()
    files: {
      medicalTestRequisition?: Express.Multer.File[];
      salesInvoice?: Express.Multer.File[];
    },
    @User() user: AuthenticatedUser,
  ) {
    if (
      !files.medicalTestRequisition ||
      !files.salesInvoice ||
      files.medicalTestRequisition.length !== 1 ||
      files.salesInvoice.length !== 1
    ) {
      throw new BadRequestException(
        'Both Medical Test Requisition and Sales Invoice images are required',
      );
    }

    return this.staffService.handleUploadInfo({
      medicalTestRequisition: files.medicalTestRequisition[0],
      salesInvoice: files.salesInvoice[0],
    });
  }

  @Post('/upload-medical-test-requisition')
  @AuthZ([Role.STAFF])
  @UseInterceptors(
    FileInterceptor('medicalTestRequisition', {
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed'), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
  )
  async uploadMedicalTestRequisition(
    @UploadedFile() file: Express.Multer.File,
    @User() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Medical Test Requisition image is required',
      );
    }

    return this.staffService.handleMedicalTestRequisitionUpload(file);
  }

  @Post('/upload-master-file')
  @AuthZ([Role.STAFF])
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file',{
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
        'application/pdf', // .pdf
        'text/plain', // .txt
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      ];
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only .xlsx, .xls, .csv, .pdf, .txt, .doc, .docx are allowed'), false);
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  }))
  async uploadMasterFile(@UploadedFile() file: Express.Multer.File, @User() user: AuthenticatedUser) {
    return this.staffService.uploadMasterFile(file, user);
  }

  @Get('/download-master-file/:id')
  @AuthZ([Role.STAFF])
  async downloadMasterFile(@Param('id') id: number) {
    return this.staffService.downloadMasterFile(id);
  }

  @Delete('/delete-master-file/:id')
  @AuthZ([Role.STAFF])
  async deleteMasterFile(@Param('id') id: number) {
    return this.staffService.deleteMasterFile(id);
  }

  @Get('/get-master-file/:id')
  @AuthZ([Role.STAFF])
  async getMasterFileById(@Param('id') id: number) {
    return this.staffService.getMasterFileById(id);
  }

  @Get('/get-all-master-files')
  @AuthZ([Role.STAFF])
  @ApiOperation({ 
    summary: 'Get all master files with pagination and filtering',
    description: 'Retrieve a paginated list of master files with support for search, filtering by filename/uploader, date range, and sorting'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search keyword for filename or uploader name' })
  @ApiQuery({ 
    name: 'filter', 
    required: false, 
    type: String, 
    description: 'JSON object for filtering. Example: {"fileName":"test","uploaderName":"john","uploadedBy":1}' 
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date filter (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date filter (ISO format)' })
  @ApiQuery({ 
    name: 'sortBy', 
    required: false, 
    type: String, 
    description: 'Sort field (id, fileName, uploadedAt, uploadedBy)', 
    enum: ['id', 'fileName', 'uploadedAt', 'uploadedBy']
  })
  @ApiQuery({ 
    name: 'sortOrder', 
    required: false, 
    type: String, 
    description: 'Sort order (ASC or DESC)', 
    enum: ['ASC', 'DESC']
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllMasterFiles(@Query() query: PaginationQueryDto) {
    return this.staffService.getAllMasterFiles(query);
  }

  @Post('/patients')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Create a new patient' })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: CreatePatientDto, examples: {
    'example 1': {
      value: {
        fullName: 'John Doe',
        healthInsuranceCode: '1234567890',
      },
    },
  } })
  async createPatient(@Body() createPatientDto: CreatePatientDto) {
    return this.staffService.createPatient(createPatientDto);
  }

  @Get('/patients')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get all patients with query' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search keyword for patient name' })
  @ApiQuery({ name: 'searchField', required: false, type: String, description: 'Search field (fullName, healthInsuranceCode, personalId)', enum: ['fullName', 'healthInsuranceCode', 'personalId'] })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date filter (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date filter (ISO format)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllPatients(@Query() query: PaginationQueryDto) {
    return this.staffService.getAllPatients(query);
  }

  @Get('patients/:patientId/sessions')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get all lab sessions of a patient' })
  async getLabSessionsByPatientId(@Param('patientId') patientId: number) {
    return this.staffService.getLabSessionsByPatientId(patientId);
  }

  @Get('sessions/:sessionId')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get a lab session by ID' })
  async getLabSessionById(@Param('sessionId') sessionId: number) {
    return this.staffService.getLabSessionById(sessionId);
  }

}
