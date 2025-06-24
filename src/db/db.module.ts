import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Env } from '../utils/constant';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from 'src/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get(Env.DB_HOST),
        port: configService.get(Env.DB_PORT),
        username: configService.get(Env.DB_USER),
        password: configService.get(Env.DB_PASS),
        database: configService.get(Env.DB_NAME),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: true,
        logging: ['query', 'error', 'schema', 'warn', 'info', 'log'],
        logger: 'advanced-console',
        global: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DbModule {
  private readonly logger = new Logger(DbModule.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    this.logger.log('Database connected');
    const roleRepo = this.dataSource.getRepository<Role>('roles');
    const count = await roleRepo.count();
    if (count === 0) {
      await roleRepo.insert([
        {
          name: 'Staff',
          description: 'General staff members with basic access permissions',
          code: '1',
        },
        {
          name: 'Lab Testing Technician',
          description:
            'Technicians responsible for conducting laboratory tests and sample analysis',
          code: '2',
        },
        {
          name: 'Analysis Technician',
          description:
            'Specialists who analyze test results and generate reports',
          code: '3',
        },
        {
          name: 'Validation Technician',
          description:
            'Experts who validate and verify test results for accuracy and compliance',
          code: '4',
        },
        {
          name: 'Doctor',
          description:
            'Medical doctors with full access to review and approve medical reports',
          code: '5',
        },
      ]);
      this.logger.log('Default roles seeded');
    }
  }

  onModuleDestroy() {
    this.logger.log('Database disconnected');
  }
}
