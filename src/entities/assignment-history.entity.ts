import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { AssignLabSession } from './assign-lab-session.entity';
import { User } from './user.entity';

@Entity('assignment_histories')
export class AssignmentHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'assign_lab_session_id' })
  assignLabSessionId: number;

  @ManyToOne(() => AssignLabSession, (assign) => assign.histories)
  @JoinColumn({ name: 'assign_lab_session_id' })
  assignLabSession: AssignLabSession;

  @Column({ 
    name: 'role_type',
    type: 'enum',
    enum: ['doctor', 'lab_testing', 'analysis', 'validation']
  })
  roleType: 'doctor' | 'lab_testing' | 'analysis' | 'validation';

  @Column({ name: 'old_user_id', nullable: true })
  oldUserId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'old_user_id' })
  oldUser: User | null;

  @Column({ name: 'new_user_id', nullable: true })
  newUserId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'new_user_id' })
  newUser: User | null;

  @Column({ name: 'changed_by' })
  changedBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by' })
  changer: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
