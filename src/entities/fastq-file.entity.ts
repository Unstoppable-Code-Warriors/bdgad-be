import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { User } from './user.entity';

@Entity('fastq_files')
export class FastqFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId: number;

  @ManyToOne(() => LabSession)
  @JoinColumn({ name: 'session_id' })
  session: LabSession;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;
}
