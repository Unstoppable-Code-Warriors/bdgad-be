import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface UploadedFiles {
  medicalTestRequisition: Express.Multer.File;
  salesInvoice: Express.Multer.File;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async handleUploadInfo(files: UploadedFiles) {
    const storePath =
      this.configService.get<string>('STORE_PATH') || './uploads';

    // Ensure the storage directory exists
    if (!fs.existsSync(storePath)) {
      fs.mkdirSync(storePath, { recursive: true });
    }

    // Process Medical Test Requisition file
    const medicalTestRequisitionSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const medicalTestRequisitionExt = path.extname(
      files.medicalTestRequisition.originalname,
    );
    const medicalTestRequisitionFilename = `medical-test-requisition-${medicalTestRequisitionSuffix}${medicalTestRequisitionExt}`;
    const medicalTestRequisitionPath = path.join(
      storePath,
      medicalTestRequisitionFilename,
    );

    fs.writeFileSync(
      medicalTestRequisitionPath,
      files.medicalTestRequisition.buffer,
    );

    // Process Sales Invoice file
    const salesInvoiceSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const salesInvoiceExt = path.extname(files.salesInvoice.originalname);
    const salesInvoiceFilename = `sales-invoice-${salesInvoiceSuffix}${salesInvoiceExt}`;
    const salesInvoicePath = path.join(storePath, salesInvoiceFilename);

    fs.writeFileSync(salesInvoicePath, files.salesInvoice.buffer);

    const savedFiles = {
      medicalTestRequisition: {
        originalName: files.medicalTestRequisition.originalname,
        filename: medicalTestRequisitionFilename,
        path: medicalTestRequisitionPath,
        size: files.medicalTestRequisition.size,
        mimetype: files.medicalTestRequisition.mimetype,
      },
      salesInvoice: {
        originalName: files.salesInvoice.originalname,
        filename: salesInvoiceFilename,
        path: salesInvoicePath,
        size: files.salesInvoice.size,
        mimetype: files.salesInvoice.mimetype,
      },
    };

    return {
      success: true,
      message: 'Files uploaded successfully',
      files: savedFiles,
      storagePath: storePath,
    };
  }

  async handleMedicalTestRequisitionUpload(file: Express.Multer.File) {
    this.logger.log('Starting Medical Test Requisition upload process');

    const storePath =
      this.configService.get<string>('STORE_PATH') || './uploads';
    this.logger.log(`Using storage path: ${storePath}`);

    // Ensure the storage directory exists
    if (!fs.existsSync(storePath)) {
      this.logger.log('Storage directory does not exist, creating it');
      fs.mkdirSync(storePath, { recursive: true });
      this.logger.log('Storage directory created successfully');
    } else {
      this.logger.log('Storage directory already exists');
    }

    // Process Medical Test Requisition file
    const medicalTestRequisitionSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const medicalTestRequisitionExt = path.extname(file.originalname);
    const medicalTestRequisitionFilename = `medical-test-requisition-${medicalTestRequisitionSuffix}${medicalTestRequisitionExt}`;
    const medicalTestRequisitionPath = path.join(
      storePath,
      medicalTestRequisitionFilename,
    );

    this.logger.log(`Saving file as: ${medicalTestRequisitionFilename}`);
    this.logger.log(`Full file path: ${medicalTestRequisitionPath}`);

    try {
      fs.writeFileSync(medicalTestRequisitionPath, file.buffer);
      this.logger.log('File saved successfully to storage');
    } catch (error) {
      this.logger.error('Failed to save file to storage', error);
      throw new Error('Failed to save file');
    }

    const savedFile = {
      originalName: file.originalname,
      filename: medicalTestRequisitionFilename,
      path: medicalTestRequisitionPath,
      size: file.size,
      mimetype: file.mimetype,
    };

    // Send to OCR service
    const ocrServiceUrl = this.configService.get<string>('OCR_SERVICE');
    if (!ocrServiceUrl) {
      this.logger.warn('OCR_SERVICE not configured, skipping OCR processing');
      return {
        success: true,
        message:
          'Medical Test Requisition uploaded successfully (OCR service not configured)',
        file: savedFile,
        storagePath: storePath,
        ocrResult: null,
      };
    }

    this.logger.log(`OCR service URL configured: ${ocrServiceUrl}`);
    const ocrEndpoint = `${ocrServiceUrl}/process_document?path=${encodeURIComponent(medicalTestRequisitionPath)}`;
    this.logger.log(`OCR endpoint: ${ocrEndpoint}`);

    let ocrResult: any = null;
    try {
      this.logger.log('Sending request to OCR service');
      const response = await firstValueFrom(this.httpService.post(ocrEndpoint));

      this.logger.log('OCR service responded successfully');
      this.logger.log(`OCR response status: ${response.status}`);
      this.logger.log(`OCR response data: ${JSON.stringify(response.data)}`);

      ocrResult = response.data;
    } catch (error) {
      this.logger.error('Failed to process document with OCR service', error);
      this.logger.error(`OCR service error details: ${error.message}`);

      // Don't throw error, just log it and continue
      ocrResult = {
        error: 'OCR processing failed',
        details: error.message,
      };
    }

    this.logger.log('Medical Test Requisition upload process completed');

    return {
      success: true,
      message: 'Medical Test Requisition uploaded successfully',
      file: savedFile,
      storagePath: storePath,
      ocrResult: ocrResult,
    };
  }
}
