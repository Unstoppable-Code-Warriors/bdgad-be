import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum ScheduledTaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('scheduled_etl_tasks')
export class ScheduledEtlTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('json')
  etlData: any; // Store the EtlResultQueueDto

  @Column()
  scheduledAt: Date;

  @Column({
    type: 'enum',
    enum: ScheduledTaskStatus,
    default: ScheduledTaskStatus.PENDING,
  })
  status: ScheduledTaskStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  processedAt: Date;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;
}
