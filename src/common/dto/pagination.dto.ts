import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  IsObject,
  IsDateString,
} from 'class-validator';

export class PaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;

  constructor(page: number, limit: number, total: number) {
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
  }
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: PaginationMetaDto;
  success: boolean;
  message?: string;
  timestamp: string;

  constructor(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message?: string,
  ) {
    this.data = data;
    this.meta = new PaginationMetaDto(page, limit, total);
    this.success = true;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  @Transform(({ value }) => value?.toUpperCase())
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  searchField?: string = 'fullName';

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value || {};
  })
  filter?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['wait_for_approval', 'approved', 'rejected'])
  filterFastq?: 'wait_for_approval' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @IsIn([
    'processing',
    'completed',
    'failed',
    'wait_for_approval',
    'rejected',
    'approved',
    'not_yet_processing',
  ])
  filterEtl?:
    | 'processing'
    | 'completed'
    | 'failed'
    | 'wait_for_approval'
    | 'rejected'
    | 'approved'
    | 'not_yet_processing';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearPatientFolder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  monthPatientFolder?: number;

  constructor() {
    this.page = this.page && this.page > 0 ? this.page : 1;
    this.limit =
      this.limit && this.limit > 0 && this.limit <= 100 ? this.limit : 10;
  }
}

export class PaginationQueryFilterGroupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  @Transform(({ value }) => value?.toUpperCase())
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  searchField?: string = 'fullName';

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value || {};
  })
  filter?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['processing', 'rejected', 'approved'])
  filterGroup?: 'processing' | 'rejected' | 'approved';
  constructor() {
    this.page = this.page && this.page > 0 ? this.page : 1;
    this.limit =
      this.limit && this.limit > 0 && this.limit <= 100 ? this.limit : 10;
  }
}
