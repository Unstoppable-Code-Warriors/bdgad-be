import { SetMetadata } from '@nestjs/common';
import { Role } from '../../utils/constant';

export const ROLES_KEY = 'roles';
export const AuthZ = (roles: Role[]) => SetMetadata(ROLES_KEY, roles);
