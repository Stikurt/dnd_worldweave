
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();
const LOBBY_TTL_HOURS = 24;

// Устанавливает expiresAt для лобби
export async function setLobbyExpiry(lobbyId) {
  const expiresAt = new Date(Date.now() + LOBBY_TTL_HOURS * 3600_000);
  await prisma.lobby.update({ where: { id: lobbyId }, data: { expiresAt } });
}

// Запускает CRON-задачу для очистки просроченных записей
export function scheduleCleanupTasks() {
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    await prisma.chatMessage.deleteMany({ where: { lobby: { expiresAt: { lt: now } } } });
    await prisma.lobbyPlayer.deleteMany({ where: { lobby: { expiresAt: { lt: now } } } });
    await prisma.lobby.deleteMany({ where: { expiresAt: { lt: now } } });
    await prisma.user.deleteMany({ where: { expiresAt: { lt: now } } });
    console.log('Cleanup executed at', now.toISOString());
  });
}