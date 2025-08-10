import { Controller, Logger } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { EventPattern } from '@nestjs/microservices';

@Controller('analysis-queue')
export class AnalysisQueueController {
  private readonly logger = new Logger(AnalysisQueueController.name);

  constructor(private readonly analysisService: AnalysisService) {}

  @EventPattern('result')
  async getEtlResultInfo(data: any) {
    this.logger.log('Processing mock ETL result info request');

    try {
      // Process the ETL result data using the analysis service
      //   const result = await this.analysisService.processEtlResultData(data);
      this.logger.log('Successfully processed ETL result data:', data);
      return data;
    } catch (error) {
      this.logger.error('Failed to process ETL result info:', error);
      return {
        error: 'Failed to process ETL result data',
        details: error.message,
      };
    }
  }
}
