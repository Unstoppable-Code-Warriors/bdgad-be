import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  ethnicity: string;

  @Column({ name: 'marital_status', nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  address1: string;

  @Column({ nullable: true })
  address2: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  nation: string;

  @Column({ name: 'work_address', nullable: true })
  workAddress: string;

  @Column({ name: 'citizen_id', unique: true })
  citizenId: string;

  @Column({ unique: true })
  barcode: string;

  @Column({
    name: 'allergies_info',
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  allergiesInfo: Record<string, any> | null;

  @Column({
    name: 'medical_record',
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  medicalRecord: Record<string, any> | null;

  @Column({
    name: 'appointment',
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  appointment: Record<string, any> | null;

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

  @OneToMany(() => LabSession, (labSession) => labSession.patient, {
    cascade: true,
  })
  labSessions: LabSession[];
}
