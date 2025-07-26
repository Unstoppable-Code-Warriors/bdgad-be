import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';
import { CategoryGeneralFileService } from './category-general-file.service';
import { CreateCategoryGeneralFileDto } from './dto/create-category-general-file.dto';
import { UpdateCategoryGeneralFileDto } from './dto/update-category-general-file.dto';
import {
  CategoryGeneralFileDto,
  CategoryGeneralFileWithFilesDto,
} from './dto/category-general-file.dto';
import { AuthGuard, RolesGuard } from 'src/auth';

@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
@ApiSecurity('token')
export class CategoryGeneralFileController {
  constructor(
    private readonly categoryGeneralFileService: CategoryGeneralFileService,
  ) {}

  @ApiTags('Staff - Category General File')
  @Post('category-general-files')
  @ApiOperation({ summary: 'Create a new category for general files' })
  @ApiBody({ type: CreateCategoryGeneralFileDto })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: CategoryGeneralFileDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Category with the same name already exists',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(
    @Body() createCategoryDto: CreateCategoryGeneralFileDto,
  ): Promise<CategoryGeneralFileDto> {
    return this.categoryGeneralFileService.create(createCategoryDto);
  }

  @ApiTags('Staff - Category General File')
  @Get('category-general-files')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({
    status: 200,
    description: 'List of all categories',
    type: [CategoryGeneralFileDto],
  })
  async findAll(): Promise<CategoryGeneralFileDto[]> {
    return this.categoryGeneralFileService.findAll();
  }

  @ApiTags('Staff - Category General File')
  @Get('category-general-files/:id')
  @ApiOperation({ summary: 'Get category by id with associated general files' })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Category details with associated general files',
    type: CategoryGeneralFileWithFilesDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryGeneralFileWithFilesDto> {
    return this.categoryGeneralFileService.findOne(id);
  }

  @ApiTags('Staff - Category General File')
  @Put('category-general-files/:id')
  @ApiOperation({ summary: 'Update category by id' })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    type: 'number',
  })
  @ApiBody({ type: UpdateCategoryGeneralFileDto })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: CategoryGeneralFileDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Category with the same name already exists',
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryGeneralFileDto,
  ): Promise<CategoryGeneralFileDto> {
    return this.categoryGeneralFileService.update(id, updateCategoryDto);
  }

  @ApiTags('Staff - Category General File')
  @Delete('category-general-files/:id')
  @ApiOperation({ summary: 'Delete category by id' })
  @ApiParam({
    name: 'id',
    description: 'Category ID',
    type: 'number',
  })
  @ApiResponse({
    status: 200,
    description: 'Category deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Category has been successfully deleted',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete category with associated general files',
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    return this.categoryGeneralFileService.remove(id);
  }
}
