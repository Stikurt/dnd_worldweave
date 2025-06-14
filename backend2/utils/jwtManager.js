// utils/jwtManager.js
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Генерирует JWT для существующего пользователя.
 * При этом, если displayName сменился, обновляет его в БД.
 */
export async function generateToken(userId, displayName) {
  await prisma.user.update({
    where: { id: userId },
    data: { displayName }
  });
  return jwt.sign({ userId, displayName }, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Проверяет валидность JWT, возвращает payload или null.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
