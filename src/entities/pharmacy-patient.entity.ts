import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pharmacy_patient')
@Index(['citizenId'])
export class PharmacyPatient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'citizen_id' })
  citizenId: string;

  @Column({
    name: 'appointment',
    type: 'jsonb',
    default: {},
  })
  appointment: Record<string, any>;

  @Column({
    name: 'patient',
    type: 'jsonb',
    default: {},
  })
  patient: Record<string, any>;

  @Column({
    name: 'medical_record',
    type: 'jsonb',
    default: {},
  })
  medicalRecord: Record<string, any>;

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
}
