import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('general_files')
export class GeneralFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'file_type', nullable: true })
  fileType: string;

  @Column({ name: 'file_size', nullable: true })
  fileSize: number;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'uploaded_by' })
  uploadedBy: number;

  @Column({
    name: 'uploaded_at',
    type: 'timestamp',
  })
  uploadedAt: Date;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
