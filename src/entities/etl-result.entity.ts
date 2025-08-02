import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LabCodeLabSession } from './labcode-lab-session.entity';
import { FastqFilePair } from './fastq-file-pair.entity';
import { User } from './user.entity';

export enum EtlResultStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAIT_FOR_APPROVAL = 'wait_for_approval',
  REJECTED = 'rejected',
  APPROVED = 'approved',
}

@Entity('etl_results')
export class EtlResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'labcode_lab_session_id' })
  labcodeLabSessionId: number;

  @Column({ name: 'fastq_file_pair_id', nullable: true })
  fastqFilePairId: number;

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
    nullable: true,
    default: null,
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

  @ManyToOne(
    () => LabCodeLabSession,
    (labcodeLabSession) => labcodeLabSession.etlResults,
  )
  @JoinColumn({ name: 'labcode_lab_session_id' })
  labcodeLabSession: LabCodeLabSession;

  @ManyToOne(() => FastqFilePair, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn({ name: 'fastq_file_pair_id' })
  fastqPair: FastqFilePair;

  @ManyToOne(() => User, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn({ name: 'reject_by' })
  rejector: User;

  @ManyToOne(() => User, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn({ name: 'comment_by' })
  commenter: User;
}
