import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { UserVerifyResponseDto } from './dto/user-verify-response.dto';
import { Env } from '../utils/constant';

@Injectable()
export class AuthService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async verifyToken(token: string): Promise<UserVerifyResponseDto> {
    try {
      const authServiceUrl = this.configService.get<string>(Env.AUTH_SERVICE);
      console.log(authServiceUrl);

      const response = await firstValueFrom(
        this.httpService.get<UserVerifyResponseDto>(
          `${authServiceUrl}/auth/verify/${token}`,
        ),
      );

      if (!response.data.valid) {
        throw new UnauthorizedException('Invalid token');
      }

      return response.data;
    } catch (error) {
      throw new UnauthorizedException('Token verification failed');
    }
  }
}
