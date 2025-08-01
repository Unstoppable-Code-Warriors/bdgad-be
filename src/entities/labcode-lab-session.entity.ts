import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { FastqFilePair } from './fastq-file-pair.entity';
import { EtlResult } from './etl-result.entity';

@Entity('labcode_lab_sessions')
export class LabCodeLabSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'lab_session_id' })
  labSessionId: number;

  @Column({ name: 'labcode', type: 'varchar' })
  labcode: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => LabSession, (labSession) => labSession.labcodes)
  @JoinColumn({ name: 'lab_session_id' })
  labSession: LabSession;

  @OneToMany(
    () => FastqFilePair,
    (fastqFilePair) => fastqFilePair.labcodeLabSession,
    {
      cascade: true,
    },
  )
  fastqFilePairs: FastqFilePair[];

  @OneToMany(() => EtlResult, (etlResult) => etlResult.labcodeLabSession, {
    cascade: true,
  })
  etlResults: EtlResult[];
}
