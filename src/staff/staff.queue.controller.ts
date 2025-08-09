import { Controller, Logger, Get } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { StaffService } from './staff.service';
import { PharmacyPatientDataDto } from './dtos/pharmacy-patient.dto';

@Controller('staff-queue')
export class StaffQueueController {
  private readonly logger = new Logger(StaffQueueController.name);

  constructor(private readonly staffService: StaffService) {}

  // @EventPattern('pharmacy_patient_info')
  @Get('pharmacy-patient-info')
  async getPharmacyPatientInfo() {
    // Mock data as requested
    const mockData: PharmacyPatientDataDto = {
      appointment: {
        id: '142e8872-94ef-449c-9b7b-5bb0d2e37a25',
        date: '2025-08-09T14:15:57.820Z',
      },
      patient: {
        fullname: 'Võ Minh Ngọc',
        ethnicity: 'Gia Rai',
        marital_status: 'Góa bụa',
        address1: '543 Điện Biên Phủ Linh',
        address2: 'Quận Hai Bà Trưng, Hà Nội',
        phone: '0395638136',
        gender: 'Nữ',
        nation: 'Việt Nam',
        work_address: 'Công ty Honda, Quận Hai Bà Trưng, Hà Nội',
        allergies: 'Dị ứng đậu phộng',
        personal_history: 'Tiền sử bệnh tim mạch',
        family_history: 'Không có tiền sử gia đình đặc biệt',
        citizen_id: '048196020166',
        date_of_birth: '1996-05-21',
      },
      medical_record: {
        start_at: '2025-08-09T09:29:00.000Z',
        reason: 'Tiêu chảy',
        current_status: 'Cần theo dõi thêm',
        treatment: 'Theo dõi huyết áp, điều chỉnh chế độ ăn',
        diagnoses: 'Viêm dạ dày mạn tính',
        lab_test: [
          {
            test_type: 'Chẩn đoán hình ảnh',
            test_name: 'Siêu âm bụng tổng quát',
            machine: 'Canon Aplio 300',
            taken_by: {
              id: '04bf2aaa-a3b4-4a93-a440-d367e8b7448a',
              name: 'Phạm Thu Hương',
            },
            notes: 'Không có can thiệp từ thuốc.',
            conclusion: 'Có cải thiện so với kết quả trước đó.',
            file_attachments: [
              {
                filename: 'patient1754748957819_CXR_20250809.pdf',
                url: '/path/to/ehr/files/patient1754748957819_CXR_20250809.pdf',
                file_type: 'application/pdf',
                file_size: 216974,
              },
              {
                filename: 'patient1754748957819_CXR_20250809_image.dcm',
                url: '/path/to/ehr/files/patient1754748957819_CXR_20250809_image.dcm',
                file_type: 'application/dicom',
                file_size: 216974,
              },
            ],
          },
          {
            test_type: 'Chẩn đoán hình ảnh',
            test_name: 'CT scan não',
            machine: 'GE Vivid E95',
            taken_by: {
              id: '24b4b612-4d2b-4987-9de9-f5a20a68ca8c',
              name: 'Lê Minh Tuấn',
            },
            notes: 'Khuyến nghị theo dõi định kỳ.',
            conclusion: 'Kết quả bình thường.',
            file_attachments: [
              {
                filename: 'patient1754748957820_CXR_20250809.pdf',
                url: '/path/to/ehr/files/patient1754748957820_CXR_20250809.pdf',
                file_type: 'application/pdf',
                file_size: 216974,
              },
              {
                filename: 'patient1754748957820_CXR_20250809_image.dcm',
                url: '/path/to/ehr/files/patient1754748957820_CXR_20250809_image.dcm',
                file_type: 'application/dicom',
                file_size: 216974,
              },
            ],
          },
        ],
        prescription: {
          issuedDate: '2025-08-09T10:12:00.000Z',
          notes: 'Kiểm tra đường huyết hàng tuần. Tái khám sau 1 tháng.',
          medications: [
            {
              name: 'Paracetamol 500mg',
              dosage: '1-2 viên/lần',
              route: 'Uống',
              frequency: 'Khi cần thiết',
              duration: '7 ngày',
              instruction: 'Uống khi đau hoặc sốt, cách nhau ít nhất 4 giờ',
              quantity: 20,
            },
            {
              name: 'Metformin 500mg',
              dosage: '2 viên/ngày',
              route: 'Uống',
              frequency: '2 lần/ngày',
              duration: '30 ngày',
              instruction: 'Uống sau bữa ăn sáng và tối',
              quantity: 60,
            },
          ],
        },
        doctor: {
          id: '03a81de5-35f5-4d50-b344-3e59e85f3110',
          email: 'ppp072003@gmail.com',
          name: 'Bác sĩ ba',
          phone: '0903456789',
          address: '789 Đường Trần Hưng Đạo, Đà Nẵng',
        },
      },
    };

    this.logger.log('Processing mock pharmacy patient info request');

    try {
      // Process the pharmacy patient data using the staff service
      const result =
        await this.staffService.processPharmacyPatientData(mockData);
      this.logger.log('Successfully processed pharmacy patient data:', result);
      return result;
    } catch (error) {
      this.logger.error('Failed to process pharmacy patient info:', error);
      return {
        error: 'Failed to process pharmacy patient data',
        details: error.message,
      };
    }
  }
}
