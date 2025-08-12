import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { PasswordResetToken } from 'src/entities/password-reset-token.entity';
import { Repository, IsNull, Not, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupSoftDeletedUsers(): Promise<void> {
    try {
      this.logger.log(
        'Starting cleanup of soft deleted users older than 30 days',
      );

      // Find users that were soft deleted (deletedAt is not null) and deletedAt is older than 30 days
      const usersToDelete = await this.userRepository.find({
        where: {
          deletedAt: Not(IsNull()),
        },
        withDeleted: true,
        select: ['id', 'email', 'deletedAt'],
      });

      if (usersToDelete.length === 0) {
        this.logger.log('No soft deleted users found');
        return;
      }

      // Filter users whose deletedAt date is more than 30 days ago
      const currentDate = new Date();
      const usersToDeleteFiltered = usersToDelete.filter((user) => {
        if (!user.deletedAt) return false;
        const deletedDate = new Date(user.deletedAt);
        const daysDifference = Math.floor(
          (currentDate.getTime() - deletedDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return daysDifference >= 30;
      });

      if (usersToDeleteFiltered.length === 0) {
        this.logger.log(
          'No users found that have been soft deleted for more than 30 days',
        );
        return;
      }

      this.logger.log(
        `Found ${usersToDeleteFiltered.length} users to permanently delete (soft deleted for more than 30 days)`,
      );

      // Permanently delete users one by one with logging
      let successCount = 0;
      let failureCount = 0;

      for (const user of usersToDeleteFiltered) {
        try {
          if (!user.deletedAt) continue;
          const deletedDate = new Date(user.deletedAt);
          const daysSinceDeleted = Math.floor(
            (currentDate.getTime() - deletedDate.getTime()) /
              (1000 * 60 * 60 * 24),
          );

          // First, delete related password reset tokens to avoid foreign key constraint violation
          await this.passwordResetTokenRepository
            .createQueryBuilder()
            .delete()
            .where('user_id = :userId', { userId: user.id })
            .execute();

          // Then permanently delete the user
          await this.userRepository.remove(user);
          this.logger.log(
            `Permanently deleted user: ${user.email} (ID: ${user.id}) - soft deleted ${daysSinceDeleted} days ago`,
          );
          successCount++;
        } catch (error) {
          this.logger.error(
            `Failed to permanently delete user ${user.email} (ID: ${user.id}): ${error.message}`,
          );
          failureCount++;
        }
      }

      this.logger.log(
        `Cleanup completed. Successfully deleted: ${successCount}, Failed: ${failureCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Error during user cleanup: ${error.message}`,
        error.stack,
      );
    }
  }
}
