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
import { LabCodeLabSession } from './labcode-lab-session.entity';
import { User } from './user.entity';
import { AssignmentHistory } from './assignment-history.entity';

@Entity('assign_lab_sessions')
export class AssignLabSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'labcode_lab_session_id' })
  labcodeLabSessionId: number;

  @OneToOne(
    () => LabCodeLabSession,
    (labcodeLabSession) => labcodeLabSession.assignment,
  )
  @JoinColumn({ name: 'labcode_lab_session_id' })
  labcodeLabSession: LabCodeLabSession;

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

  @Column({ name: 'request_date_lab_testing', nullable: true })
  requestDateLabTesting: Date;

  @Column({ name: 'analysis_id', nullable: true })
  analysisId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'analysis_id' })
  analysis: User | null;

  @Column({ name: 'request_date_analysis', nullable: true })
  requestDateAnalysis: Date;

  @Column({ name: 'validation_id', nullable: true })
  validationId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validation_id' })
  validation: User | null;

  @Column({ name: 'request_date_validation', nullable: true })
  requestDateValidation: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // One-to-many relationship with AssignmentHistory
  @OneToMany(() => AssignmentHistory, (history) => history.assignLabSession)
  histories: AssignmentHistory[];
}
