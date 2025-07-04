import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Env, S3Bucket } from './constant';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>(Env.S3_ENDPOINT);
    const accessKeyId = this.configService.get<string>(Env.S3_ACCESS_KEY_ID);
    const secretAccessKey = this.configService.get<string>(
      Env.S3_SECRET_ACCESS_KEY,
    );

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 configuration is missing. Please check S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY environment variables.',
      );
    }

    // Initialize S3 client for Cloudflare R2
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      // Cloudflare R2 compatibility settings
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /**
   * Upload a file to S3
   * @param bucket - S3 bucket name
   * @param key - File key/path in S3
   * @param fileBuffer - File buffer to upload
   * @param contentType - File content type
   * @returns Promise<string> - The S3 URL of the uploaded file
   */
  async uploadFile(
    bucket: string,
    key: string,
    fileBuffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);

    // Return the S3 URL
    const endpoint = this.configService.get<string>(Env.S3_ENDPOINT);
    return `${endpoint}/${bucket}/${key}`;
  }

  /**
   * Upload FastQ file specifically
   * @param sessionId - Lab session ID
   * @param fileName - Original file name
   * @param fileBuffer - File buffer
   * @param contentType - File content type
   * @returns Promise<string> - The S3 URL of the uploaded file
   */
  async uploadFastQFile(
    sessionId: number,
    fileName: string,
    fileBuffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const key = `session-${sessionId}/${timestamp}_${fileName}`;

    return this.uploadFile(S3Bucket.FASTQ_FILE, key, fileBuffer, contentType);
  }

  /**
   * Generate a presigned URL for downloading a file
   * @param bucket - S3 bucket name
   * @param key - File key/path in S3
   * @param expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns Promise<string> - Presigned URL
   */
  async generatePresigned(
    bucket: string,
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Delete a file from S3
   * @param bucket - S3 bucket name
   * @param key - File key/path in S3
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * Extract key from S3 URL
   * @param s3Url - S3 URL
   * @param bucket - S3 bucket name
   * @returns string - File key
   */
  extractKeyFromUrl(s3Url: string, bucket: string): string {
    const endpoint = this.configService.get<string>(Env.S3_ENDPOINT);
    const prefix = `${endpoint}/${bucket}/`;

    if (s3Url.startsWith(prefix)) {
      return s3Url.substring(prefix.length);
    }

    throw new Error(`Invalid S3 URL format: ${s3Url}`);
  }
}
