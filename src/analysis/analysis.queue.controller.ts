import { Controller, Logger } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { EventPattern } from '@nestjs/microservices';
import { EtlResultQueueDto } from './dto/etl-result-queue.dto';

@Controller('analysis-queue')
export class AnalysisQueueController {
  private readonly logger = new Logger(AnalysisQueueController.name);

  constructor(private readonly analysisService: AnalysisService) {}

  @EventPattern('result')
  async getEtlResultInfo(data: EtlResultQueueDto) {
    this.logger.log('Processing ETL result request');

    try {
      // Process the ETL result data using the analysis service
      const result = await this.analysisService.processEtlResultFromQueue(data);
      this.logger.log('Successfully processed ETL result data:', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to process ETL result info:', error);
      return {
        error: 'Failed to process ETL result data',
        details: error.message,
        success: false,
      };
    }
  }
}
