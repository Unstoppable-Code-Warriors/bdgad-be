import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { GeneralFile } from './general-file.entity';

@Entity('categories_general_files')
export class CategoryGeneralFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => GeneralFile, (generalFile) => generalFile.category)
  generalFiles: GeneralFile[];
}
