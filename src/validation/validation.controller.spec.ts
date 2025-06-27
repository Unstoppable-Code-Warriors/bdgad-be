import { Test, TestingModule } from '@nestjs/testing';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';

describe('ValidationController', () => {
  let controller: ValidationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ValidationController],
      providers: [ValidationService],
    }).compile();

    controller = module.get<ValidationController>(ValidationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
