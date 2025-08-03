import { Injectable, BadRequestException } from '@nestjs/common';
import {
  FileCategory,
  FileCategoryDto,
  OCRResultDto,
  UploadCategorizedFilesDto,
} from '../dtos/upload-categorized-files.dto';

@Injectable()
export class FileValidationService {
  private readonly REQUIRED_CATEGORIES = [
    FileCategory.PRENATAL_SCREENING,
    FileCategory.HEREDITARY_CANCER,
    FileCategory.GENE_MUTATION,
  ];

  private readonly MAX_FILES_PER_CATEGORY = 1;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_MIME_TYPES = [
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

  /**
   * Validate categorized file upload
   */
  validateCategorizedUpload(
    files: Express.Multer.File[],
    uploadData: UploadCategorizedFilesDto,
  ): void {
    this.validateFileCount(files, uploadData.fileCategories);
    this.validateFileCategories(uploadData.fileCategories);
    this.validateRequiredCategories(uploadData.fileCategories);
    this.validateFileTypes(files);
    this.validateFileSizes(files);
    this.validateOCRResults(
      uploadData.ocrResults || [],
      uploadData.fileCategories,
    );
  }

  /**
   * Check if file count matches category count
   */
  private validateFileCount(
    files: Express.Multer.File[],
    categories: FileCategoryDto[],
  ): void {
    if (files.length !== categories.length) {
      throw new BadRequestException(
        `File count (${files.length}) must match category count (${categories.length})`,
      );
    }

    if (files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
  }

  /**
   * Validate file categories and check for duplicates
   */
  private validateFileCategories(categories: FileCategoryDto[]): void {
    const specialCategories = categories.filter(
      (cat) => cat.category !== FileCategory.GENERAL,
    );

    // Check for duplicate special categories
    const categoryGroups = specialCategories.reduce(
      (acc, cat) => {
        acc[cat.category] = (acc[cat.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const duplicates = Object.entries(categoryGroups).filter(
      ([, count]) => count > this.MAX_FILES_PER_CATEGORY,
    );

    if (duplicates.length > 0) {
      const duplicateCategories = duplicates.map(([category]) => category);
      throw new BadRequestException(
        `Duplicate categories not allowed: ${duplicateCategories.join(', ')}. Maximum ${this.MAX_FILES_PER_CATEGORY} file per special category.`,
      );
    }

    // Validate enum values
    for (const cat of categories) {
      if (!Object.values(FileCategory).includes(cat.category)) {
        throw new BadRequestException(
          `Invalid file category: ${cat.category}. Allowed values: ${Object.values(FileCategory).join(', ')}`,
        );
      }
    }
  }

  /**
   * Validate that at least one required category is present
   */
  private validateRequiredCategories(categories: FileCategoryDto[]): void {
    const specialCategories = categories
      .filter((cat) => cat.category !== FileCategory.GENERAL)
      .map((cat) => cat.category);

    const hasAtLeastOneRequired = this.REQUIRED_CATEGORIES.some((required) =>
      specialCategories.includes(required),
    );

    if (!hasAtLeastOneRequired) {
      throw new BadRequestException(
        `At least one file from required categories is needed: ${this.REQUIRED_CATEGORIES.join(', ')}`,
      );
    }
  }

  /**
   * Validate file types
   */
  private validateFileTypes(files: Express.Multer.File[]): void {
    const invalidFiles = files.filter(
      (file) => !this.ALLOWED_MIME_TYPES.includes(file.mimetype),
    );

    if (invalidFiles.length > 0) {
      const invalidFileNames = invalidFiles.map((f) => f.originalname);
      throw new BadRequestException(
        `Invalid file types: ${invalidFileNames.join(', ')}. Allowed types: ${this.ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
  }

  /**
   * Validate file sizes
   */
  private validateFileSizes(files: Express.Multer.File[]): void {
    const oversizedFiles = files.filter(
      (file) => file.size > this.MAX_FILE_SIZE,
    );

    if (oversizedFiles.length > 0) {
      const oversizedFileNames = oversizedFiles.map((f) => f.originalname);
      const maxSizeMB = this.MAX_FILE_SIZE / (1024 * 1024);
      throw new BadRequestException(
        `Files exceed maximum size of ${maxSizeMB}MB: ${oversizedFileNames.join(', ')}`,
      );
    }
  }

  /**
   * Validate OCR results structure and completeness
   */
  private validateOCRResults(
    ocrResults: OCRResultDto[],
    categories: FileCategoryDto[],
  ): void {
    if (!ocrResults || ocrResults.length === 0) {
      return; // OCR results are optional
    }

    // Validate fileIndex range
    const maxIndex = categories.length - 1;
    const invalidIndexes = ocrResults.filter(
      (ocr) => ocr.fileIndex < 0 || ocr.fileIndex > maxIndex,
    );

    if (invalidIndexes.length > 0) {
      throw new BadRequestException(
        `Invalid OCR result file indexes: ${invalidIndexes.map((o) => o.fileIndex).join(', ')}. Must be between 0 and ${maxIndex}`,
      );
    }

    // Validate category matching
    for (const ocrResult of ocrResults) {
      const expectedCategory = categories[ocrResult.fileIndex]?.category;
      if (ocrResult.category !== expectedCategory) {
        throw new BadRequestException(
          `OCR result category mismatch at index ${ocrResult.fileIndex}. Expected: ${expectedCategory}, Got: ${ocrResult.category}`,
        );
      }
    }

    // Validate required fields per category
    this.validateOCRDataCompleteness(ocrResults);
  }

  /**
   * Validate OCR data completeness based on category
   */
  private validateOCRDataCompleteness(ocrResults: OCRResultDto[]): void {
    const requiredFields = {
      [FileCategory.PRENATAL_SCREENING]: ['full_name', 'date_of_birth'],
      [FileCategory.HEREDITARY_CANCER]: ['full_name', 'date_of_birth'],
      [FileCategory.GENE_MUTATION]: ['full_name', 'date_of_birth'],
      [FileCategory.GENERAL]: [], // No required fields for general files
    };

    for (const ocrResult of ocrResults) {
      const required = requiredFields[ocrResult.category] || [];
      const missing = required.filter(
        (field) => !ocrResult.ocrData || !ocrResult.ocrData[field],
      );

      if (missing.length > 0) {
        throw new BadRequestException(
          `OCR data missing required fields for ${ocrResult.category}: ${missing.join(', ')}`,
        );
      }
    }
  }

  /**
   * Get file processing priority order
   */
  getProcessingOrder(categories: FileCategoryDto[]): number[] {
    return categories
      .map((cat, index) => ({ index, priority: cat.priority || 5 }))
      .sort((a, b) => b.priority - a.priority) // Higher priority first
      .map((item) => item.index);
  }

  /**
   * Check if uploaded files meet minimum requirements
   */
  validateMinimumRequirements(categories: FileCategoryDto[]): {
    isValid: boolean;
    missingCategories: FileCategory[];
    summary: string;
  } {
    const uploadedSpecialCategories = categories
      .filter((cat) => cat.category !== FileCategory.GENERAL)
      .map((cat) => cat.category);

    const missingCategories = this.REQUIRED_CATEGORIES.filter(
      (required) => !uploadedSpecialCategories.includes(required),
    );

    const hasAtLeastOne = uploadedSpecialCategories.length > 0;

    return {
      isValid: hasAtLeastOne,
      missingCategories,
      summary: hasAtLeastOne
        ? `✓ Valid upload with ${uploadedSpecialCategories.length} special files`
        : `✗ Missing required files. Need at least one from: ${this.REQUIRED_CATEGORIES.join(', ')}`,
    };
  }
}
