import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { EtlResultQueueDto } from './dto/etl-result-queue.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ScheduledEtlTask } from 'src/entities/scheduled-etl-task.entity';
import { Repository } from 'typeorm';

@Controller('analysis-queue')
export class AnalysisQueueController {
  private readonly logger = new Logger(AnalysisQueueController.name);

  constructor(
    @InjectRepository(ScheduledEtlTask)
    private readonly scheduledTaskRepository: Repository<ScheduledEtlTask>,
  ) {}

  @EventPattern('result')
  async getEtlResultInfo(data: EtlResultQueueDto) {
    this.logger.log(
      'Received ETL result request, scheduling for 5-minute delay',
    );

    try {
      // Calculate scheduled time (5 minutes from now)
      const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);

      // Save the task to be processed later
      const scheduledTask = this.scheduledTaskRepository.create({
        etlData: data,
        scheduledAt: scheduledAt,
      });

      await this.scheduledTaskRepository.save(scheduledTask);

      this.logger.log(
        `ETL result task scheduled with ID: ${scheduledTask.id} for ${scheduledAt}`,
      );

      return {
        message: 'ETL result processing scheduled successfully',
        success: true,
        taskId: scheduledTask.id,
        scheduledFor: scheduledAt,
      };
    } catch (error) {
      this.logger.error('Failed to schedule ETL result processing:', error);
      return {
        error: 'Failed to schedule ETL result processing',
        details: error.message,
        success: false,
      };
    }
  }
}
