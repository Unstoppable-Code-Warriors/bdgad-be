import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { User } from './user.entity';

@Entity('patient_files')
export class PatientFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id' })
  sessionId: number;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_type' })
  fileType: string;

  @Column({
    name: 'ocr_result',
    type: 'jsonb',
    nullable: true,
  })
  ocrResult: Record<string, any>;

  @Column({ name: 'uploaded_by' })
  uploadedBy: number;

  @Column({
    name: 'uploaded_at',
    type: 'timestamp',
  })
  uploadedAt: Date;

  @ManyToOne(() => LabSession, (labSession) => labSession.patientFiles, {
    cascade: true,
  })
  @JoinColumn({ name: 'session_id' })
  session: LabSession;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
