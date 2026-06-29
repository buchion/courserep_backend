import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'development-secret',
      issuer: config.get<string>('JWT_ISSUER', 'course-rep'),
      audience: config.get<string>('JWT_AUDIENCE', 'course-rep-users'),
    });
  }

  validate(payload: { sub?: string; id?: string }) {
    const userId = payload.sub ?? payload.id;
    if (!userId) throw new UnauthorizedException();
    return { id: userId };
  }
}
