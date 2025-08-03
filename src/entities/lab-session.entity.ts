import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { PatientFile } from './patient-file.entity';
import { LabCodeLabSession } from './labcode-lab-session.entity';

@Entity('lab_sessions')
export class LabSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'patient_id' })
  patientId: number;

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

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  // Relationships
  @ManyToOne(() => Patient, (patient) => patient.labSessions)
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @OneToMany(() => PatientFile, (patientFile) => patientFile.session, {
    cascade: true,
  })
  patientFiles: PatientFile[];

  // One-to-many relationship with LabCodeLabSession
  @OneToMany(
    () => LabCodeLabSession,
    (labcodeLabSession) => labcodeLabSession.labSession,
    {
      cascade: true,
    },
  )
  labcodes: LabCodeLabSession[];
}
