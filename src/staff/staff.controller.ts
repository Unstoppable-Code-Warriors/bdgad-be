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
  Put,
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
import {
  ApiBody,
  ApiConsumes,
  ApiSecurity,
  ApiQuery,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreatePatientDto } from './dtos/create-patient-dto.req';
import { UploadPatientFilesDto } from './dtos/upload-patient-files.dto';
import { UploadCategorizedFilesDto } from './dtos/upload-categorized-files.dto';
import { UploadGeneralFilesDto } from './dtos/upload-general-files.dto';
import { GeneralFilesQueryDto } from './dtos/general-files-query.dto';
import { errorUploadFile } from 'src/utils/errorRespones';
import { UpdatePatientDto } from './dtos/update-patient-dto.req';
import { AssignLabcodeDto } from './dtos/assign-lab-session.dto.req';
import { SendGeneralFileToEMRDto } from './dtos/send-general-file-to-emr.dto';
import * as path from 'path';
import { GenerateLabcodeRequestDto } from './dtos/generate-labcode.dto';

@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @ApiTags('Test')
  @Post('/test')
  @ApiOperation({
    summary: 'Test',
  })
  @AuthZ([Role.STAFF])
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        if (allowedExt.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed!'), false);
        }
      },
    }),
  )
  async test(@UploadedFile() file: Express.Multer.File) {
    return this.staffService.test(file);
  }

  @ApiTags('Staff - OCR file')
  @Post('/ocr')
  @ApiOperation({
    summary: 'Ocr file path',
  })
  @AuthZ([Role.STAFF])
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        if (allowedExt.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed!'), false);
        }
      },
    }),
  )
  async uploadMedicalTestRequisition(
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.staffService.ocrFilePath(file);
  }

  // General Files api
  @ApiTags('Staff - General Files')
  @Post('/general-files')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Upload multiple general files',
    description: 'Upload multiple general files at once',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        categoryGeneralFileId: {
          type: 'number',
          description: 'Category ID for the general files',
        },
        description: {
          type: 'string',
          description: 'Description for the uploaded files',
          example: 'Important documents',
        },
      },
      required: ['files', 'categoryGeneralFileId'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 20 }], {
      fileFilter: (req, file, cb) => {
        // Log filename encoding for debugging
        console.log('Upload filename:', file.originalname);
        console.log(
          'Filename bytes:',
          Buffer.from(file.originalname).toString('hex'),
        );

        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
          'application/pdf', // .pdf
          'text/plain', // .txt
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'image/jpeg', // .jpg
          'image/jpg', // .jpg
          'image/png', // .png
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only .xlsx, .xls, .csv, .pdf, .txt, .doc, .docx, .jpg, .png files are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 20, // Maximum 20 files
      },
      preservePath: true, // Preserve the original filename path
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async uploadGeneralFiles(
    @UploadedFiles() files: { files?: Express.Multer.File[] },
    @Body() uploadDto: UploadGeneralFilesDto,
    @User() user: AuthenticatedUser,
  ) {
    if (!files.files || files.files.length === 0) {
      return errorUploadFile.fileNotFound;
    }

    return this.staffService.uploadGeneralFiles(
      files.files,
      user,
      uploadDto.categoryGeneralFileId,
      uploadDto.description,
    );
  }

  @ApiTags('Staff - General Files')
  @Get('/general-files/:id/download')
  @ApiOperation({ summary: 'Download a general file' })
  @AuthZ([Role.STAFF])
  async downloadGeneralFile(@Param('id') id: number) {
    const downloadUrl = await this.staffService.downloadGeneralFile(id);
    const expiresIn = 3600; // 1 hour in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      downloadUrl,
      expiresIn,
      expiresAt,
    };
  }

  @ApiTags('Staff - General Files')
  @Delete('/general-files/:id')
  @ApiOperation({ summary: 'Delete a general file' })
  @AuthZ([Role.STAFF])
  async deleteGeneralFile(@Param('id') id: number) {
    return this.staffService.deleteGeneralFile(id);
  }

  @ApiTags('Staff - General Files')
  @Get('/general-files/:id')
  @ApiOperation({ summary: 'Get a general file by ID' })
  @AuthZ([Role.STAFF])
  async getGeneralFileById(@Param('id') id: number) {
    return this.staffService.getGeneralFileById(id);
  }

  @ApiTags('Staff - General Files')
  @Get('/general-files')
  @ApiOperation({ summary: 'Get all general files' })
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Get all general files with pagination and filtering',
    description:
      'Retrieve a paginated list of general files with support for search, filtering by filename/uploader, date range, and sorting',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search keyword for filename or uploader name',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description:
      'JSON object for filtering. Example: {"fileName":"test","uploaderName":"john","uploadedBy":1}',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Start date filter (ISO format)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'End date filter (ISO format)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Sort field (id, fileName, uploadedAt, uploadedBy)',
    enum: ['id', 'fileName', 'uploadedAt', 'uploadedBy'],
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    description: 'Sort order (ASC or DESC)',
    enum: ['ASC', 'DESC'],
  })
  @ApiQuery({
    name: 'categoryGeneralFileId',
    required: false,
    type: Number,
    description: 'Filter by category ID',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllGeneralFiles(@Query() query: GeneralFilesQueryDto) {
    return this.staffService.getAllGeneralFiles(query);
  }

  @ApiTags('Staff - General Files')
  @Post('/general-files/send-to-emr')
  @ApiOperation({
    summary: 'Send general files to EMR system',
    description:
      'Send multiple categories of general files to EMR system and update sendEmrAt timestamp',
  })
  @AuthZ([Role.STAFF])
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({
    type: SendGeneralFileToEMRDto,
    examples: {
      'example 1': {
        value: {
          categoryGeneralFileIds: [1, 6],
        },
      },
    },
  })
  async sendGeneralFileToEMR(@Body() sendDto: SendGeneralFileToEMRDto) {
    return this.staffService.sendGeneralFileToEMR(
      sendDto.categoryGeneralFileIds,
    );
  }

  // Patient api
  @ApiTags('Staff - Patients')
  @Post('/patients')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Create a new folder patient' })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({
    type: CreatePatientDto,
    examples: {
      'example 1': {
        value: {
          fullName: 'John Doe',
          citizenId: '1234567890',
        },
      },
    },
  })
  async createPatient(@Body() createPatientDto: CreatePatientDto) {
    return this.staffService.createPatient(createPatientDto);
  }

  @ApiTags('Staff - Patients')
  @Get('/patients')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get all patients with query' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search keyword for patient name',
  })
  @ApiQuery({
    name: 'searchField',
    required: false,
    type: String,
    description: 'Search field (fullName, citizenId)',
    enum: ['fullName', 'citizenId'],
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Start date filter (ISO format)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'End date filter (ISO format)',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllPatients(@Query() query: PaginationQueryDto) {
    return this.staffService.getAllPatients(query);
  }

  @ApiTags('Staff - Patients')
  @Put('patients/:patientId')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Update a folder patient' })
  @ApiBody({
    type: UpdatePatientDto,
    examples: {
      example: {
        summary: 'Cập nhật một số thông tin bệnh nhân',
        value: {
          fullName: 'Nguyễn Văn A',
          dateOfBirth: '1990-01-01T00:00:00.000Z',
          phone: '0912345678',
          address: '123 Đường ABC, Quận 1, TP.HCM',
          citizenId: '012345678901',
        },
      },
      minimalUpdate: {
        summary: 'Chỉ cập nhật họ tên và số CCCD',
        value: {
          fullName: 'Trần Thị B',
          citizenId: '987654321000',
        },
      },
    },
  })
  async updatePatientById(
    @Param('patientId') patientId: number,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    return this.staffService.updatePatientById(patientId, updatePatientDto);
  }

  @ApiTags('Staff - Patients')
  @Delete('patients/:patientId')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Delete a folder patient' })
  async deletePatientById(@Param('patientId') patientId: number) {
    return this.staffService.deletePatientById(patientId);
  }

  // Session api

  @ApiTags('Staff - Sessions')
  @Get('patients/:patientId/sessions')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get all lab sessions of a patient' })
  async getLabSessionsByPatientId(@Param('patientId') patientId: number) {
    return this.staffService.getLabSessionsByPatientId(patientId);
  }

  @ApiTags('Staff - Sessions')
  @Get('sessions/:sessionId')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Get a lab session by ID' })
  async getLabSessionById(@Param('sessionId') sessionId: number) {
    return this.staffService.getLabSessionById(sessionId);
  }

  @ApiTags('Staff - Sessions')
  @Put('sessions/:sessionId')
  @AuthZ([Role.STAFF])
  @ApiOperation({ summary: 'Assign a lab session to a doctor or lab testing' })
  @ApiBody({
    type: AssignLabcodeDto,
    examples: {
      'example 1': {
        summary: 'Assign lab session to a doctor and lab testing',
        value: {
          doctorId: 1,
          assignment: [
            {
              labcode: 'O5123A',
              labTestingId: 1,
            },
            {
              labcode: 'N5456B',
              labTestingId: 2,
            },
          ],
        },
      },
    },
  })
  async assignLabSession(
    @Param('sessionId') sessionId: number,
    @Body() assignLabcodeDto: AssignLabcodeDto,
    @User() user: AuthenticatedUser,
  ) {
    return this.staffService.assignDoctorAndLabTestingLabSession(
      sessionId,
      assignLabcodeDto,
      user,
    );
  }

  // Patient File api
  @ApiTags('Staff - Patient Files')
  @Get('patient-files/:patientFileId/sessions/:sessionId/download')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Download a patient file by session ID and patient file ID',
  })
  async downloadPatientFile(
    @Param('sessionId') sessionId: number,
    @Param('patientFileId') patientFileId: number,
  ) {
    return this.staffService.downloadPatientFile(sessionId, patientFileId);
  }

  @ApiTags('Staff - Patient Files')
  @Delete('patient-files/:patientFileId/sessions/:sessionId')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Delete a patient file by session ID and patient file ID',
  })
  async deletePatientFile(
    @Param('sessionId') sessionId: number,
    @Param('patientFileId') patientFileId: number,
  ) {
    return this.staffService.deletePatientFile(sessionId, patientFileId);
  }

  @ApiTags('Staff - Patient Files')
  @Put('patient-files/sessions/:labSessionId')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Add patient files to existing lab session',
    description:
      'Add multiple patient files with optional OCR results to an existing lab session',
  })
  @ApiParam({
    name: 'labSessionId',
    type: 'number',
    description: 'Lab session ID',
    example: 1,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Patient files to add with form data',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 20 }], {
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg', // .jpg
          'image/jpg', // .jpg
          'image/png', // .png
          'application/pdf', // .pdf
          'text/plain', // .txt
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only images, PDF, text, csv, xls, xlsx, doc, docx files are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 20, // Maximum 20 files
      },
      preservePath: true, // Preserve the original filename path
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async updatePatientFiles(
    @Param('labSessionId') labSessionId: number,
    @UploadedFiles() files: { files?: Express.Multer.File[] },
    @User() user: AuthenticatedUser,
  ) {
    if (!files.files || files.files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    return this.staffService.updatePatientFiles(
      labSessionId,
      files.files,
      user,
    );
  }

  @ApiTags('Staff - Patient Files')
  @Post('patient-files/upload')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Upload patient files with OCR results',
    description:
      'Upload multiple patient files with optional OCR results and create/update lab session',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Patient files upload with form data',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
        patientId: {
          type: 'number',
          description: 'Patient ID',
          example: 1,
        },
        typeLabSession: {
          type: 'string',
          enum: ['test', 'validation'],
          description: 'Type of lab session',
          example: 'test',
        },
        labcode: {
          type: 'string',
          description: 'Labcode',
          example: '[O5123A, N5456B]',
        },
        ocrResult: {
          type: 'string',
          description:
            'OCR results as JSON string. Array of objects with filename as key and OCR result as value',
          example: [
            {
              'Mô U Phổi': {
                name: 'thang',
                age: '20',
              },
            },
            { 'Mô U Đại trực tràng': null },
            {
              'quoc phong': {
                name: 'thang',
                age: '20',
              },
            },
            { 'hai phong': null },
            { 'hai banh': 1233 },
          ],
        },
      },
      required: ['files', 'patientId', 'typeLabSession'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 20 }], {
      fileFilter: (req, file, cb) => {
        // Log filename encoding for debugging
        console.log('Upload filename:', file.originalname);
        console.log(
          'Filename bytes:',
          Buffer.from(file.originalname).toString('hex'),
        );

        const allowedMimeTypes = [
          'image/jpeg', // .jpg
          'image/jpg', // .jpg
          'image/png', // .png
          'application/pdf', // .pdf
          'text/plain', // .txt
          'application/msword', // .doc
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only images, PDF, text, csv, xls, xlsx, doc, docx files are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 20, // Maximum 20 files
      },
      preservePath: true, // Preserve the original filename path
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async uploadPatientFiles(
    @UploadedFiles() files: { files?: Express.Multer.File[] },
    @Body() uploadData: UploadPatientFilesDto,
    @User() user: AuthenticatedUser,
  ) {
    if (!files.files || files.files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    return this.staffService.uploadPatientFiles(files.files, uploadData, user);
  }

  // New API v2 - Categorized file upload
  @ApiTags('Staff - Patient Files V2')
  @Post('patient-files/upload-v2')
  @AuthZ([Role.STAFF])
  @ApiOperation({
    summary: 'Upload categorized patient files with enhanced validation',
    description:
      'Upload patient files with category-specific OCR processing. Supports 3 special categories: prenatal_screening, hereditary_cancer, gene_mutation, plus general files.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Categorized patient files upload with enhanced validation',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description:
            'Files to upload (must match fileCategories array order)',
        },
        patientId: {
          type: 'number',
          description: 'Patient ID',
          example: 1,
        },
        typeLabSession: {
          type: 'string',
          enum: ['test', 'validation'],
          description: 'Type of lab session',
          example: 'test',
        },
        fileCategories: {
          type: 'string',
          description: 'JSON array of file category mappings',
          example: JSON.stringify([
            {
              category: 'hereditary_cancer',
              priority: 8,
              fileName: 'hereditary_cancer_form.pdf',
            },
            {
              category: 'gene_mutation',
              priority: 7,
              fileName: 'gene_mutation_test.jpg',
            },
          ]),
        },
        ocrResults: {
          type: 'string',
          description: 'JSON array of OCR results mapped to specific files',
          example: JSON.stringify([
            {
              fileIndex: 0,
              category: 'hereditary_cancer',
              confidence: 0.95,
              ocrData: {
                full_name: 'Nguyen Van A',
                date_of_birth: '1990-01-01',
                cancer_screening_package: 'bcare',
              },
            },
          ]),
        },
        labcode: {
          type: 'string',
          description: 'Array of lab codes (optional)',
          example: '["O5123A", "N5456B"]',
        },
      },
      required: ['files', 'patientId', 'typeLabSession', 'fileCategories'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'files', maxCount: 20 }], {
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Only images, PDF, text, csv, xls, xlsx, doc, docx files are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 20, // Maximum 20 files
      },
      preservePath: true,
    }),
  )
  @UsePipes(
    new ValidationPipe({ transform: false, skipMissingProperties: true }),
  )
  async uploadCategorizedPatientFiles(
    @UploadedFiles() files: { files?: Express.Multer.File[] },
    @Body() uploadData: any, // Use any to bypass validation initially
    @User() user: AuthenticatedUser,
  ) {
    // Debug logging to see what we actually receive
    console.log('=== UPLOAD-V2 DEBUG ===');
    console.log('Raw body keys:', Object.keys(uploadData || {}));
    console.log(
      'patientId type:',
      typeof uploadData?.patientId,
      'value:',
      uploadData?.patientId,
    );
    console.log(
      'typeLabSession type:',
      typeof uploadData?.typeLabSession,
      'value:',
      uploadData?.typeLabSession,
    );
    console.log(
      'fileCategories type:',
      typeof uploadData?.fileCategories,
      'value:',
      uploadData?.fileCategories,
    );
    console.log(
      'ocrResults type:',
      typeof uploadData?.ocrResults,
      'value:',
      uploadData?.ocrResults,
    );
    console.log(
      'labcode type:',
      typeof uploadData?.labcode,
      'value:',
      uploadData?.labcode,
    );
    console.log('Files count:', files.files?.length || 0);
    console.log('=== END DEBUG ===');

    if (!files.files || files.files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    // Create a plain object for manual parsing (avoid DTO validation during assignment)
    const processedData: any = {
      patientId: 0,
      typeLabSession: 'test',
      fileCategories: [],
      ocrResults: [],
      labcode: [],
    };

    // Manual parsing for FormData issues - ensure data is correctly parsed
    try {
      // Convert patientId
      if (uploadData.patientId) {
        processedData.patientId = parseInt(String(uploadData.patientId), 10);
        if (isNaN(processedData.patientId)) {
          throw new BadRequestException('Invalid patientId - must be a number');
        }
      } else {
        throw new BadRequestException('patientId is required');
      }

      // Convert typeLabSession
      if (uploadData.typeLabSession) {
        processedData.typeLabSession = String(uploadData.typeLabSession);
        if (!['test', 'validation'].includes(processedData.typeLabSession)) {
          throw new BadRequestException(
            'Invalid typeLabSession - must be test or validation',
          );
        }
      } else {
        throw new BadRequestException('typeLabSession is required');
      }

      // Parse fileCategories
      if (uploadData.fileCategories) {
        if (typeof uploadData.fileCategories === 'string') {
          try {
            processedData.fileCategories = JSON.parse(
              uploadData.fileCategories,
            );
            console.log(
              'Manually parsed fileCategories:',
              processedData.fileCategories,
            );
          } catch (e) {
            console.error('Failed to parse fileCategories JSON:', e);
            throw new BadRequestException('Invalid fileCategories JSON format');
          }
        } else if (Array.isArray(uploadData.fileCategories)) {
          processedData.fileCategories = uploadData.fileCategories;
        } else {
          throw new BadRequestException(
            'fileCategories must be a JSON string or array',
          );
        }
      } else {
        throw new BadRequestException('fileCategories is required');
      }

      // Parse ocrResults (optional)
      if (uploadData.ocrResults) {
        if (typeof uploadData.ocrResults === 'string') {
          try {
            processedData.ocrResults = JSON.parse(uploadData.ocrResults);
            console.log(
              'Manually parsed ocrResults:',
              processedData.ocrResults,
            );
          } catch (e) {
            console.error('Failed to parse ocrResults JSON:', e);
            throw new BadRequestException('Invalid ocrResults JSON format');
          }
        } else if (Array.isArray(uploadData.ocrResults)) {
          processedData.ocrResults = uploadData.ocrResults;
        } else {
          throw new BadRequestException(
            'ocrResults must be a JSON string or array',
          );
        }
      }

      // Parse labcode (optional)
      if (uploadData.labcode) {
        if (typeof uploadData.labcode === 'string') {
          try {
            processedData.labcode = JSON.parse(uploadData.labcode);
            console.log('Manually parsed labcode:', processedData.labcode);
          } catch (e) {
            console.error('Failed to parse labcode JSON:', e);
            // For labcode, we can fall back to treating it as a single item
            processedData.labcode = [uploadData.labcode];
          }
        } else if (Array.isArray(uploadData.labcode)) {
          processedData.labcode = uploadData.labcode;
        }
      }

      console.log('=== PROCESSED DATA ===');
      console.log('processedData.patientId:', processedData.patientId);
      console.log(
        'processedData.typeLabSession:',
        processedData.typeLabSession,
      );
      console.log(
        'processedData.fileCategories:',
        processedData.fileCategories,
      );
      console.log('processedData.ocrResults:', processedData.ocrResults);
      console.log('processedData.labcode:', processedData.labcode);
      console.log('=== END PROCESSED DATA ===');

      // Manual validation of parsed data
      this.validateProcessedData(processedData);
    } catch (error) {
      console.error('Error in manual parsing:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Data parsing error: ${error.message}`);
    }

    return this.staffService.uploadCategorizedPatientFiles(
      files.files,
      processedData as UploadCategorizedFilesDto,
      user,
    );
  }

  private validateProcessedData(data: any) {
    // Validate patientId
    if (
      typeof data.patientId !== 'number' ||
      Number.isNaN(data.patientId) ||
      data.patientId <= 0
    ) {
      throw new BadRequestException('patientId must be a positive number');
    }

    // Validate typeLabSession
    if (
      !data.typeLabSession ||
      !['test', 'validation'].includes(String(data.typeLabSession))
    ) {
      throw new BadRequestException(
        'typeLabSession must be "test" or "validation"',
      );
    }

    // Validate fileCategories
    if (
      !Array.isArray(data.fileCategories) ||
      data.fileCategories.length === 0
    ) {
      throw new BadRequestException('fileCategories must be a non-empty array');
    }

    const validCategories = [
      'prenatal_screening',
      'hereditary_cancer',
      'gene_mutation',
      'general',
    ];

    for (let i = 0; i < data.fileCategories.length; i++) {
      const category = data.fileCategories[i];

      if (!category || typeof category !== 'object') {
        throw new BadRequestException(`fileCategories[${i}] must be an object`);
      }

      if (!category.category || typeof category.category !== 'string') {
        throw new BadRequestException(
          `fileCategories[${i}].category must be a non-empty string`,
        );
      }

      if (!validCategories.includes(String(category.category))) {
        throw new BadRequestException(
          `fileCategories[${i}].category must be one of: ${validCategories.join(', ')}`,
        );
      }

      if (!category.fileName || typeof category.fileName !== 'string') {
        throw new BadRequestException(
          `fileCategories[${i}].fileName must be a non-empty string`,
        );
      }

      if (category.priority !== undefined) {
        const priority = Number(category.priority);
        if (Number.isNaN(priority) || priority < 1 || priority > 10) {
          throw new BadRequestException(
            `fileCategories[${i}].priority must be a number between 1 and 10`,
          );
        }
        category.priority = priority; // Ensure it's a number
      }
    }

    // Validate ocrResults (optional)
    if (data.ocrResults && Array.isArray(data.ocrResults)) {
      for (let i = 0; i < data.ocrResults.length; i++) {
        const ocrResult = data.ocrResults[i];

        if (!ocrResult || typeof ocrResult !== 'object') {
          throw new BadRequestException(`ocrResults[${i}] must be an object`);
        }

        const fileIndex = Number(ocrResult.fileIndex);
        if (Number.isNaN(fileIndex) || fileIndex < 0) {
          throw new BadRequestException(
            `ocrResults[${i}].fileIndex must be a non-negative integer`,
          );
        }
        ocrResult.fileIndex = fileIndex; // Ensure it's a number

        if (
          !ocrResult.category ||
          !validCategories.includes(String(ocrResult.category))
        ) {
          throw new BadRequestException(
            `ocrResults[${i}].category must be one of: ${validCategories.join(', ')}`,
          );
        }

        if (ocrResult.confidence !== undefined) {
          const confidence = Number(ocrResult.confidence);
          if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
            throw new BadRequestException(
              `ocrResults[${i}].confidence must be a number between 0 and 1`,
            );
          }
          ocrResult.confidence = confidence; // Ensure it's a number
        }
      }
    }

    // Validate labcode (optional)
    if (data.labcode && !Array.isArray(data.labcode)) {
      throw new BadRequestException('labcode must be an array');
    }

    if (data.labcode) {
      for (let i = 0; i < data.labcode.length; i++) {
        if (!data.labcode[i] || typeof data.labcode[i] !== 'string') {
          throw new BadRequestException(
            `labcode[${i}] must be a non-empty string`,
          );
        }
      }
    }
  }

  // Labcode generation api
  @Post('labcode')
  @ApiTags('Staff - Labcode')
  @ApiOperation({
    summary: 'Generate labcode for test',
    description:
      'Generate a unique labcode based on test type, package type, and sample type. Format: [TEST_CODE][RANDOM_LETTER][RANDOM_NUMBER] (e.g., N5AH941)',
  })
  @ApiBody({
    type: GenerateLabcodeRequestDto,
    examples: {
      nipt_example: {
        summary: 'NIPT Example',
        value: {
          testType: 'non_invasive_prenatal_testing',
          packageType: 'NIPT 5',
        },
      },
      hereditary_example: {
        summary: 'Hereditary Cancer Example',
        value: {
          testType: 'hereditary_cancer',
          packageType: 'breast_cancer_bcare',
        },
      },
      gene_mutation_example: {
        summary: 'Gene Mutation Example',
        value: {
          testType: 'gene_mutation_testing',
          packageType: 'Onco81',
          sampleType: 'biopsy_tissue_ffpe',
        },
      },
    },
  })
  @AuthZ([Role.STAFF])
  @UsePipes(new ValidationPipe({ transform: true }))
  async generateLabcode(@Body() request: GenerateLabcodeRequestDto) {
    return this.staffService.generateLabcode(request);
  }
}
