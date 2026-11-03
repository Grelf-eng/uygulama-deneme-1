import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

type AuthCheckResult =
  | { status: 'ok'; userId: number }
  | { status: 'revoked'; message: string }
  | { status: 'invalid' };

function parseToken(req: Request): AuthCheckResult {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return { status: 'invalid' };
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return { status: 'invalid' };

    const tokenSid = (payload as any).sid as string | undefined;

    // Tek aktif oturum kontrolü (Single Active Session)
    const user = db.prepare('SELECT id, session_token FROM users WHERE id = ?').get(id) as
      | { id: number; session_token?: string }
      | undefined;

    if (!user) return { status: 'invalid' };

    // Eğer kullanıcının veritabanında aktif bir session_token'ı varsa ve token ile eşleşmiyorsa
    if (user.session_token) {
      if (!tokenSid || user.session_token !== tokenSid) {
        return {
          status: 'revoked',
          message: 'Hesabınıza başka bir cihazdan giriş yapıldı. Güvenliğiniz için bu cihazdaki oturum sonlandırıldı.',
        };
      }
    }

    return { status: 'ok', userId: id };
  } catch {
    return { status: 'invalid' };
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const result = parseToken(req);
  if (result.status === 'revoked') {
    res.status(401).json({
      error: result.message,
      code: 'SESSION_REVOKED',
    });
    return;
  }
  if (result.status !== 'ok' || result.userId === undefined) {
    res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş' });
    return;
  }
  req.userId = result.userId;
  next();
}

/** Token varsa userId'yi doldurur, yoksa anonim devam eder. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const result = parseToken(req);
  if (result.status === 'ok') req.userId = result.userId;
  next();
}

export function signToken(userId: number, sessionToken?: string): string {
  const payload: Record<string, any> = {};
  if (sessionToken) {
    payload.sid = sessionToken;
  }
  return jwt.sign(payload, config.jwtSecret, { subject: String(userId), expiresIn: '30d' });
}
