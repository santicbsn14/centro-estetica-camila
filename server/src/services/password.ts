import argon2 from 'argon2';

export function hashPassword(plano: string): Promise<string> {
  return argon2.hash(plano);
}

export function verifyPassword(hash: string, plano: string): Promise<boolean> {
  return argon2.verify(hash, plano);
}
