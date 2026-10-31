import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

function parseToken(req: Request): number | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const id = parseToken(req);
  if (id === null) {
    res.status(401).json({ error: 'Oturum geçersiz veya süresi dolmuş' });
    return;
  }
  req.userId = id;
  next();
}

/** Token varsa userId'yi doldurur, yoksa anonim devam eder. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const id = parseToken(req);
  if (id !== null) req.userId = id;
  next();
}

export function signToken(userId: number): string {
  return jwt.sign({}, config.jwtSecret, { subject: String(userId), expiresIn: '30d' });
}
