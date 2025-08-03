import { Test, TestingModule } from '@nestjs/testing';
import { CategoryGeneralFileController } from './category-general-file.controller';

describe('CategoryGeneralFileController', () => {
  let controller: CategoryGeneralFileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryGeneralFileController],
    }).compile();

    controller = module.get<CategoryGeneralFileController>(
      CategoryGeneralFileController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
