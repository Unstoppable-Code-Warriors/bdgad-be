import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { errorUserAuthen } from 'src/utils/errorRespones';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new HttpException(errorUserAuthen.tokenNotFound, 200);
    }

    try {
      const verifyResult = await this.authService.verifyToken(token);
      request.user = verifyResult.user;
      return true;
    } catch (error) {
      throw new HttpException(errorUserAuthen.invalidToken, 200);
    }
  }
  private extractTokenFromHeader(request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.split(' ')[1];
  }
}
