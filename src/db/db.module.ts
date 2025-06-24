import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Env } from '../utils/constant';
import { Logger } from '@nestjs/common';

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
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
        global: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DbModule {
  private readonly logger = new Logger(DbModule.name);

  onModuleInit() {
    this.logger.log('Database connected');
  }

  onModuleDestroy() {
    this.logger.log('Database disconnected');
  }
}
