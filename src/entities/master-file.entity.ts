import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('master_files')
export class MasterFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_name' })
  fileName: string;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;
}
