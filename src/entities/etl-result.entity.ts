import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { User } from './user.entity';

export enum EtlResultStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

@Entity('etl_results')
export class EtlResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id' })
  sessionId: number;

  @Column({ name: 'result_path' })
  resultPath: string;

  @Column({
    name: 'etl_completed_at',
    type: 'timestamp',
  })
  etlCompletedAt: Date;

  @Column({
    type: 'enum',
    enum: EtlResultStatus,
    default: EtlResultStatus.PENDING,
  })
  status: EtlResultStatus;

  @Column({ name: 'redo_reason', nullable: true })
  redoReason: string;

  @Column({ name: 'reject_by', nullable: true })
  rejectBy: number;

  @Column({ nullable: true })
  comment: string;

  @Column({ name: 'comment_by', nullable: true })
  commentBy: number;

  @ManyToOne(() => LabSession, (labSession) => labSession.etlResults)
  @JoinColumn({ name: 'session_id' })
  session: LabSession;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'reject_by' })
  rejector: User;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'comment_by' })
  commenter: User;
}
