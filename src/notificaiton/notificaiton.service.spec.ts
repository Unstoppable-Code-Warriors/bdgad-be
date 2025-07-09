import { Test, TestingModule } from '@nestjs/testing';
import { NotificaitonService } from './notificaiton.service';

describe('NotificaitonService', () => {
  let service: NotificaitonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificaitonService],
    }).compile();

    service = module.get<NotificaitonService>(NotificaitonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
