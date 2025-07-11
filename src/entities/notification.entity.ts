import { TypeNotification } from 'src/utils/constant';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notifications')
export class Notifications {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'title' })
  title: string;

  @Column({ name: 'message' })
  message: string;

  @Column({ name: 'type', enum: TypeNotification, nullable: false })
  type: string;

  @Column({ name: 'sender_id' })
  senderId: number;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'receiver_id' })
  receiverId: number;

  @ManyToOne(() => User, {
    cascade: true,
  })
  @JoinColumn({ name: 'receiver_id' })
  receiver: User;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: new Date() })
  createdAt: Date;
}
