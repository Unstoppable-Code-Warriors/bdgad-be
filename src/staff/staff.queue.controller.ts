import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';

@Controller('staff-queue')
export class StaffQueueController {
  private readonly logger = new Logger(StaffQueueController.name);

  @EventPattern('pharmacy_patient_info')
  async getPharmacyPatientInfo(data: any) {
    this.logger.log('Received pharmacy patient info request:', data);
    if (!data) {
      this.logger.warn('Invalid pharmacy patient info request:', data);
      return { error: 'Invalid request' };
    }

    return data;
  }
}
