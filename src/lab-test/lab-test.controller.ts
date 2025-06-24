import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { LabTestService } from './lab-test.service';
import {
  LabSessionWithFastqResponseDto,
  LabSessionWithAllFastqResponseDto,
} from './dto/lab-session-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';

@Controller('lab-test')
export class LabTestController {
  constructor(private readonly labTestService: LabTestService) {}

  @Get('sessions')
  @UsePipes(new ValidationPipe({ transform: true }))
  async findAllSession(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<LabSessionWithFastqResponseDto>> {
    return this.labTestService.findAllSession(query);
  }

  @Get('sessions/:id')
  async findSessionById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<LabSessionWithAllFastqResponseDto> {
    return this.labTestService.findSessionById(id);
  }
}
