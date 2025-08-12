import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { PasswordResetToken } from 'src/entities/password-reset-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, PasswordResetToken])],
  providers: [TaskService],
})
export class TaskModule {}
