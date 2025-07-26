import { Test, TestingModule } from '@nestjs/testing';
import { CategoryGeneralFileService } from './category-general-file.service';

describe('CategoryGeneralFileService', () => {
  let service: CategoryGeneralFileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoryGeneralFileService],
    }).compile();

    service = module.get<CategoryGeneralFileService>(CategoryGeneralFileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
