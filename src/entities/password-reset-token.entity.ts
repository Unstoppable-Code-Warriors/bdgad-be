import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Entity,
} from 'typeorm';

import { Column } from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  token: string;

  @Column({
    type: 'timestamp',
    name: 'expires_at',
  })
  expiresAt: Date;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'false',
  })
  used: string;

  @CreateDateColumn({
    type: 'timestamp',
    name: 'created_at',
  })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.passwordResetTokens, {
    cascade: true,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
