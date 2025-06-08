import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Staff API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/staff/upload-medical-test-requisition (POST) - should require file', () => {
    return request(app.getHttpServer())
      .post('/staff/upload-medical-test-requisition')
      .expect(400);
  });

  it('/staff/upload-info (POST) - should require files', () => {
    return request(app.getHttpServer()).post('/staff/upload-info').expect(400);
  });
});
