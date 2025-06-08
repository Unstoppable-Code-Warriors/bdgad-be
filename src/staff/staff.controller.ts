import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('/upload-info')
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
  ) {
    if (!file) {
      throw new BadRequestException(
        'Medical Test Requisition image is required',
      );
    }

    return this.staffService.handleMedicalTestRequisitionUpload(file);
  }
}
