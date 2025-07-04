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
import { ApiBody, ApiConsumes, ApiSecurity } from '@nestjs/swagger';

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

}
