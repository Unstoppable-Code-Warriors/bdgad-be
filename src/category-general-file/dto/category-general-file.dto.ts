import { ApiProperty } from '@nestjs/swagger';

export class CategoryGeneralFileDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;
}

export class CategoryGeneralFileWithFilesDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({
    description: 'List of general files in this category',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        fileName: { type: 'string' },
        fileType: { type: 'string' },
        fileSize: { type: 'number' },
        filePath: { type: 'string' },
        description: { type: 'string' },
        uploadedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  generalFiles: {
    id: number;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath: string;
    description: string;
    uploadedAt: Date;
  }[];
}
