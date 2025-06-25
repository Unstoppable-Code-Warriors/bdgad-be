import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { User } from './user.entity';

export enum FastqFileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REDO = 'redo',
}

@Entity('fastq_files')
export class FastqFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id' })
  sessionId: number;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;

  @Column({ name: 'created_by' })
  createdBy: number;

  @Column({
    type: 'enum',
    enum: FastqFileStatus,
    default: FastqFileStatus.PENDING,
  })
  status: FastqFileStatus;

  @Column({ name: 'redo_reason', nullable: true })
  redoReason: string;

  @Column({ name: 'reject_by', nullable: true })
  rejectBy: number;

  @ManyToOne(() => LabSession, (labSession) => labSession.fastqFiles)
  @JoinColumn({ name: 'session_id' })
  session: LabSession;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'reject_by' })
  rejector: User;
}
