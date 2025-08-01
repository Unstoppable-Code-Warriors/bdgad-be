import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LabSession } from './lab-session.entity';
import { User } from './user.entity';
import { AssignmentHistory } from './assignment-history.entity';

@Entity('assign_lab_sessions')
export class AssignLabSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'lab_session_id' })
  labSessionId: number;

  @OneToOne(() => LabSession, (labSession) => labSession.assignment)
  @JoinColumn({ name: 'lab_session_id' })
  labSession: LabSession;

  @Column({ name: 'doctor_id', nullable: true })
  doctorId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'doctor_id' })
  doctor: User | null;

  @Column({ name: 'lab_testing_id', nullable: true })
  labTestingId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'lab_testing_id' })
  labTesting: User | null;

  @Column({ name: 'analysis_id', nullable: true })
  analysisId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'analysis_id' })
  analysis: User | null;

  @Column({ name: 'validation_id', nullable: true })
  validationId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validation_id' })
  validation: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // One-to-many relationship with AssignmentHistory
  @OneToMany(() => AssignmentHistory, (history) => history.assignLabSession)
  histories: AssignmentHistory[];
}
