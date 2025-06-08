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
    // Use absolute path resolution to avoid path issues
    const configuredStorePath =
      this.configService.get<string>('STORE_PATH') || './uploads';
    const storePath = path.isAbsolute(configuredStorePath)
      ? configuredStorePath
      : path.resolve(process.cwd(), configuredStorePath);

    this.logger.log(`Using storage path: ${storePath}`);

    // Ensure the storage directory exists
    try {
      if (!fs.existsSync(storePath)) {
        this.logger.log('Storage directory does not exist, creating it');
        fs.mkdirSync(storePath, { recursive: true });
        this.logger.log('Storage directory created successfully');
      }

      // Verify directory is writable
      fs.accessSync(storePath, fs.constants.W_OK);
      this.logger.log('Storage directory is writable');
    } catch (error) {
      this.logger.error(
        `Failed to create or access storage directory: ${storePath}`,
        error,
      );
      throw new Error(`Storage directory is not accessible: ${error.message}`);
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

    try {
      fs.writeFileSync(
        medicalTestRequisitionPath,
        files.medicalTestRequisition.buffer,
      );
      this.logger.log(
        `Medical test requisition file saved: ${medicalTestRequisitionFilename}`,
      );
    } catch (error) {
      this.logger.error('Failed to save medical test requisition file', error);
      throw new Error(
        `Failed to save medical test requisition file: ${error.message}`,
      );
    }

    // Process Sales Invoice file
    const salesInvoiceSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const salesInvoiceExt = path.extname(files.salesInvoice.originalname);
    const salesInvoiceFilename = `sales-invoice-${salesInvoiceSuffix}${salesInvoiceExt}`;
    const salesInvoicePath = path.join(storePath, salesInvoiceFilename);

    try {
      fs.writeFileSync(salesInvoicePath, files.salesInvoice.buffer);
      this.logger.log(`Sales invoice file saved: ${salesInvoiceFilename}`);
    } catch (error) {
      this.logger.error('Failed to save sales invoice file', error);
      throw new Error(`Failed to save sales invoice file: ${error.message}`);
    }

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

    // Use absolute path resolution to avoid path issues
    const configuredStorePath =
      this.configService.get<string>('STORE_PATH') || './uploads';
    const storePath = path.isAbsolute(configuredStorePath)
      ? configuredStorePath
      : path.resolve(process.cwd(), configuredStorePath);

    this.logger.log(`Using storage path: ${storePath}`);
    this.logger.log(`Current working directory: ${process.cwd()}`);
    this.logger.log(`Configured store path: ${configuredStorePath}`);

    // Validate file input
    if (!file || !file.buffer) {
      this.logger.error('Invalid file: no file or buffer provided');
      throw new Error('Invalid file provided');
    }

    this.logger.log(
      `File details - Name: ${file.originalname}, Size: ${file.size}, Type: ${file.mimetype}`,
    );

    // Ensure the storage directory exists
    try {
      if (!fs.existsSync(storePath)) {
        this.logger.log('Storage directory does not exist, creating it');
        fs.mkdirSync(storePath, { recursive: true });
        this.logger.log('Storage directory created successfully');
      } else {
        this.logger.log('Storage directory already exists');
      }

      // Verify directory is writable
      fs.accessSync(storePath, fs.constants.W_OK);
      this.logger.log('Storage directory is writable');
    } catch (error) {
      this.logger.error(
        `Failed to create or access storage directory: ${storePath}`,
        error,
      );
      throw new Error(`Storage directory is not accessible: ${error.message}`);
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
    this.logger.log(`File buffer size: ${file.buffer.length} bytes`);

    try {
      fs.writeFileSync(medicalTestRequisitionPath, file.buffer);
      this.logger.log('File saved successfully to storage');

      // Verify file was actually written
      if (fs.existsSync(medicalTestRequisitionPath)) {
        const savedFileStats = fs.statSync(medicalTestRequisitionPath);
        this.logger.log(`File verified - Size: ${savedFileStats.size} bytes`);

        if (savedFileStats.size !== file.buffer.length) {
          this.logger.warn(
            `File size mismatch - Expected: ${file.buffer.length}, Actual: ${savedFileStats.size}`,
          );
        }
      } else {
        this.logger.error(
          'File was not created despite successful write operation',
        );
        throw new Error(
          'File verification failed - file does not exist after write',
        );
      }
    } catch (error) {
      this.logger.error('Failed to save file to storage', error);
      this.logger.error(`Error details: ${error.message}`);
      this.logger.error(`Error code: ${error.code}`);
      throw new Error(`Failed to save file: ${error.message}`);
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
