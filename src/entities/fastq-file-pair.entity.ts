import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  ManyToOne,
} from 'typeorm';
import { FastqFile } from './fastq-file.entity';
import { LabCodeLabSession } from './labcode-lab-session.entity';
import { User } from './user.entity';

export enum FastqFileStatus {
  UPLOADED = 'uploaded',
  WAIT_FOR_APPROVAL = 'wait_for_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
@Entity('fastq_file_pairs')
export class FastqFilePair {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'labcode_lab_session_id' })
  labcodeLabSessionId: number;

  @OneToOne(() => FastqFile)
  @JoinColumn({ name: 'fastq_file_r1_id' })
  fastqFileR1: FastqFile;

  @Column({ name: 'fastq_file_r1_id' })
  fastqFileR1Id: number;

  @OneToOne(() => FastqFile)
  @JoinColumn({ name: 'fastq_file_r2_id' })
  fastqFileR2: FastqFile;

  @Column({ name: 'fastq_file_r2_id' })
  fastqFileR2Id: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;

  @Column({ name: 'created_by' })
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToOne(() => LabCodeLabSession, (labcodeLabSession) => labcodeLabSession.fastqFilePairs)
  @JoinColumn({ name: 'labcode_lab_session_id' })
  labcodeLabSession: LabCodeLabSession;

  @Column({
    type: 'enum',
    enum: FastqFileStatus,
    nullable: true,
    default: null,
  })
  status: FastqFileStatus | null;

  @Column({ name: 'redo_reason', nullable: true })
  redoReason: string;

  @Column({ name: 'reject_by', nullable: true })
  rejectBy: number;

  @Column({ name: 'approve_by', nullable: true })
  approveBy: number;

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
  @JoinColumn({ name: 'approve_by' })
  approver: User;
}
