import { Test, TestingModule } from '@nestjs/testing';
import { LabTestService } from './lab-test.service';

describe('LabTestService', () => {
  let service: LabTestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LabTestService],
    }).compile();

    service = module.get<LabTestService>(LabTestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
