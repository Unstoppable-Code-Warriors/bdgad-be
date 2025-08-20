import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
import { AnalysisService } from './analysis.service';
import {
  ScheduledEtlTask,
  ScheduledTaskStatus,
} from 'src/entities/scheduled-etl-task.entity';

@Injectable()
export class AnalysisCronService {
  private readonly logger = new Logger(AnalysisCronService.name);

  constructor(
    @InjectRepository(EtlResult)
    private readonly etlResultRepository: Repository<EtlResult>,
    @InjectRepository(ScheduledEtlTask)
    private readonly scheduledTaskRepository: Repository<ScheduledEtlTask>,
    private readonly analysisService: AnalysisService,
  ) {}

  // Run every minute to check for scheduled ETL tasks
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledEtlTasks() {
    this.logger.log('Checking for scheduled ETL tasks...');

    try {
      // Find tasks that are ready to be processed
      const now = new Date();
      const readyTasks = await this.scheduledTaskRepository.find({
        where: {
          status: ScheduledTaskStatus.PENDING,
          scheduledAt: LessThan(now),
        },
      });

      if (readyTasks.length === 0) {
        this.logger.log('No scheduled ETL tasks ready for processing');
        return;
      }

      this.logger.log(
        `Found ${readyTasks.length} scheduled ETL task(s) ready for processing`,
      );

      for (const task of readyTasks) {
        try {
          this.logger.log(`Processing scheduled ETL task ID: ${task.id}`);

          // Process the ETL result
          const result = await this.analysisService.processEtlResultFromQueue(
            task.etlData,
          );

          if (result.success) {
            // Mark task as completed
            task.status = ScheduledTaskStatus.COMPLETED;
            task.processedAt = new Date();
          } else {
            // Mark task as failed
            task.status = ScheduledTaskStatus.FAILED;
            task.errorMessage = result.message;
            task.processedAt = new Date();
          }

          await this.scheduledTaskRepository.save(task);

          this.logger.log(
            `Successfully processed scheduled ETL task ID: ${task.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process scheduled ETL task ID: ${task.id}`,
            error.stack,
          );

          // Mark task as failed
          task.status = ScheduledTaskStatus.FAILED;
          task.errorMessage = error.message;
          task.processedAt = new Date();
          await this.scheduledTaskRepository.save(task);
        }
      }
    } catch (error) {
      this.logger.error('Error processing scheduled ETL tasks:', error.stack);
    }
  }

  // Run every 2 minutes
  @Cron('0 */2 * * * *')
  async checkStaleEtlResults() {
    this.logger.log('Checking for stale ETL results...');

    try {
      // Calculate the cutoff time: 39 hours and 55 minutes ago
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 39);
      cutoffTime.setMinutes(cutoffTime.getMinutes() - 55);

      // Find ETL results that have been processing for more than 39h 55m
      const staleEtlResults = await this.etlResultRepository.find({
        where: {
          status: EtlResultStatus.PROCESSING,
          startTime: LessThan(cutoffTime),
        },
        relations: {
          labcodeLabSession: {
            labSession: {
              patient: true,
            },
          },
          fastqPair: {
            fastqFileR1: true,
            fastqFileR2: true,
          },
        },
      });

      if (staleEtlResults.length === 0) {
        this.logger.log('No stale ETL results found');
        return;
      }

      this.logger.log(`Found ${staleEtlResults.length} stale ETL result(s)`);

      // Process each stale ETL result
      for (const etlResult of staleEtlResults) {
        try {
          this.logger.log(
            `Processing stale ETL result ID: ${etlResult.id}, started at: ${etlResult.startTime}`,
          );

          // Run the ETL pipeline for this result
          await this.runEtlPipelineForResult(etlResult);

          this.logger.log(
            `Successfully triggered ETL pipeline for result ID: ${etlResult.id}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process stale ETL result ID: ${etlResult.id}`,
            error.stack,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error checking for stale ETL results:', error.stack);
    }
  }

  private async runEtlPipelineForResult(etlResult: EtlResult): Promise<void> {
    // Extract the necessary data to run the ETL pipeline
    const labcodeSession = etlResult.labcodeLabSession;
    const barcode = labcodeSession?.labSession?.patient?.barcode;
    const labcode = [labcodeSession?.labcode || 'unknown'];

    if (
      !etlResult.fastqPair?.fastqFileR1 ||
      !etlResult.fastqPair?.fastqFileR2
    ) {
      this.logger.warn(
        `ETL result ID: ${etlResult.id} does not have valid FastQ files`,
      );
      return;
    }

    // Call the runEtlPipeline method with correct parameters
    await this.analysisService.runEtlPipeline(
      etlResult,
      labcode,
      barcode,
      1, // System user ID for cron jobs
      etlResult.fastqPair,
    );
  }
}
