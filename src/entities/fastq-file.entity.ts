import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('fastq_files')
export class FastqFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;
}
