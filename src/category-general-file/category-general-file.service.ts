import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryGeneralFile } from '../entities/category-general-file.entity';
import { CreateCategoryGeneralFileDto } from './dto/create-category-general-file.dto';
import { UpdateCategoryGeneralFileDto } from './dto/update-category-general-file.dto';
import {
  CategoryGeneralFileDto,
  CategoryGeneralFileWithFilesDto,
} from './dto/category-general-file.dto';
import { errorCategoryGeneralFile } from '../utils/errorRespones';

@Injectable()
export class CategoryGeneralFileService {
  constructor(
    @InjectRepository(CategoryGeneralFile)
    private categoryRepository: Repository<CategoryGeneralFile>,
  ) {}

  async create(
    createCategoryDto: CreateCategoryGeneralFileDto,
  ): Promise<CategoryGeneralFileDto | any> {
    // Check if category with same name already exists
    const existingCategory = await this.categoryRepository.findOne({
      where: { name: createCategoryDto.name },
    });

    if (existingCategory) {
      return errorCategoryGeneralFile.categoryAlreadyExists;
    }

    // Create new category
    const category = this.categoryRepository.create(createCategoryDto);
    const savedCategory = await this.categoryRepository.save(category);

    return {
      id: savedCategory.id,
      name: savedCategory.name,
      description: savedCategory.description,
    };
  }

  async findAll(): Promise<CategoryGeneralFileDto[]> {
    const categories = await this.categoryRepository.find({
      select: {
        id: true,
        name: true,
        description: true,
      },
      relations: {
        generalFiles: true,
      },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      generalFiles: category.generalFiles || [],
    }));
  }

  async findOne(id: number): Promise<CategoryGeneralFileWithFilesDto | any> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: {
        generalFiles: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        generalFiles: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          filePath: true,
          description: true,
          uploadedAt: true,
          sendEmrAt: true,
        },
      },
    });

    if (!category) {
      return errorCategoryGeneralFile.categoryNotFound;
    }

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      generalFiles: category.generalFiles || [],
    };
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryGeneralFileDto,
  ): Promise<CategoryGeneralFileDto | any> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      return errorCategoryGeneralFile.categoryNotFound;
    }

    // Check if name is being updated and if it conflicts with existing category
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { name: updateCategoryDto.name },
      });

      if (existingCategory) {
        return errorCategoryGeneralFile.categoryAlreadyExists;
      }
    }

    // Update category
    Object.assign(category, updateCategoryDto);
    const updatedCategory = await this.categoryRepository.save(category);

    return {
      id: updatedCategory.id,
      name: updatedCategory.name,
      description: updatedCategory.description,
    };
  }

  async remove(id: number): Promise<{ message: string } | any> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: {
        generalFiles: true,
      },
    });

    if (!category) {
      return errorCategoryGeneralFile.categoryNotFound;
    }

    // Check if category has any general files
    if (category.generalFiles && category.generalFiles.length > 0) {
      return errorCategoryGeneralFile.categoryHasFiles;
    }

    await this.categoryRepository.remove(category);

    return {
      message: `Category '${category.name}' has been successfully deleted`,
    };
  }
}
