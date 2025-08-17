import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { EtlResult, EtlResultStatus } from '../entities/etl-result.entity';
import { AnalysisService } from './analysis.service';

@Injectable()
export class AnalysisCronService {
  private readonly logger = new Logger(AnalysisCronService.name);

  constructor(
    @InjectRepository(EtlResult)
    private readonly etlResultRepository: Repository<EtlResult>,
    private readonly analysisService: AnalysisService,
  ) {}

  // Run every 5 minutes
  @Cron(CronExpression.EVERY_5_MINUTES)
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
