export interface EtlResultQueueDto {
  etlResultId: number;
  labcode: string;
  barcode: string;
  lane: string;
  fastq_1_url: string;
  fastq_2_url: string;
  genome: string;
  htmlResult: string;
  excelResult: string;
  complete_time: string | null;
}

export interface EtlResultQueueResponseDto {
  message: string;
  success: boolean;
}
