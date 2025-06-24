import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { User } from './user.entity';
import { PatientFile } from './patient-file.entity';
import { FastqFile } from './fastq-file.entity';
import { EtlResult } from './etl-result.entity';

@Entity('lab_sessions')
export class LabSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'patient_id' })
  patientId: number;

  @Column({ unique: true })
  labcode: string;

  @Column()
  barcode: string;

  @Column({ name: 'request_date', type: 'date' })
  requestDate: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: Date;

  @Column({
    type: 'jsonb',
    default: {},
  })
  metadata: Record<string, any>;

  @Column({ name: 'doctor_id' })
  doctorId: number;

  @ManyToOne(() => Patient, (patient) => patient.labSessions)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'doctor_id' })
  doctor: User;

  @OneToMany(() => PatientFile, (patientFile) => patientFile.session)
  patientFiles: PatientFile[];

  @OneToMany(() => FastqFile, (fastqFile) => fastqFile.session)
  fastqFiles: FastqFile[];

  @OneToMany(() => EtlResult, (etlResult) => etlResult.session)
  etlResults: EtlResult[];
}
