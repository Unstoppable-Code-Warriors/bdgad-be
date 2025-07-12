import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
  })
  updatedAt: Date;

  @Column({
    name: 'type_lab_session',
    type: 'varchar',
    enum: ['test', 'validation'],
  })
  typeLabSession: string;

  @Column({
    type: 'jsonb',
    default: {},
  })
  metadata: Record<string, any>;

  @Column({ name: 'doctor_id', nullable: true })
  doctorId: number | null;

  @ManyToOne(() => Patient, (patient) => patient.labSessions)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor: User;

  @Column({ name: 'lab_testing_id', nullable: true })
  labTestingId: number | null;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'lab_testing_id' })
  labTesting: User;

  @Column({ name: 'analysis_id', nullable: true })
  analysisId: number | null;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'analysis_id' })
  analysis: User;

  @Column({ name: 'validation_id', nullable: true })
  validationId: number | null;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'validation_id' })
  validation: User;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @OneToMany(() => PatientFile, (patientFile) => patientFile.session, {
    cascade: true,
  })
  patientFiles: PatientFile[];

  @OneToMany(() => FastqFile, (fastqFile) => fastqFile.session, {
    cascade: true,
  })
  fastqFiles: FastqFile[];

  @OneToMany(() => EtlResult, (etlResult) => etlResult.session, {
    cascade: true,
  })
  etlResults: EtlResult[];
}
