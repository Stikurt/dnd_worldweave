import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

import { generateToken, verifyToken } from './utils/jwtManager.js';
import { setLobbyExpiry, scheduleCleanupTasks } from './utils/tokenManager.js';

import lobbyHandler from './socketHandlers/lobby.js';
import chatHandler  from './socketHandlers/chat.js';
import gameHandler  from './socketHandlers/game.js';
import musicHandler from './socketHandlers/music.js';
import voiceHandler from './socketHandlers/voice.js';

const app    = express();
const server = http.createServer(app);
const io     = new IOServer(server, { cors: { origin: '*' } });
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// CRON-очистка «устаревших» записей
scheduleCleanupTasks();

// === REST: JWT-логин ===
app.post('/api/auth', async (req, res) => {
  const { displayName } = req.body;
  if (!displayName?.trim()) {
    return res.status(400).json({ error: 'DisplayName required' });
  }
  const name = displayName.trim();

  let user = await prisma.user.findFirst({ where: { displayName: name } });
  if (!user) {
    user = await prisma.user.create({ data: { displayName: name } });
  }

  const token = await generateToken(user.id, name);
  res.json({ token });
});

// JWT-мидлварь для REST
function jwtMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  req.user = payload;
  next();
}

// Список активных лобби
app.get('/api/lobby', jwtMiddleware, async (req, res) => {
  try {
    const lobbies = await prisma.lobby.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: { id: true, name: true, createdAt: true }
    });
    res.json(lobbies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Создание лобби
app.post('/api/lobby', jwtMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const lobby = await prisma.lobby.create({ data: {
      name: name.trim(),
      masterId: req.user.userId
    }});
    await setLobbyExpiry(lobby.id);
    await prisma.lobbyPlayer.create({
      data: { lobbyId: lobby.id, userId: req.user.userId }
    });
    res.json({ id: lobby.id, name: lobby.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// REST-чат: история
app.get('/api/lobby/:id/chat', jwtMiddleware, async (req, res) => {
  const lobbyId = Number(req.params.id);
  try {
    const msgs = await prisma.chatMessage.findMany({
      where: { lobbyId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// REST-чат: отправка
app.post('/api/lobby/:id/chat', jwtMiddleware, async (req, res) => {
  const lobbyId = Number(req.params.id);
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
  try {
    const msg = await prisma.chatMessage.create({
      data: {
        lobbyId,
        userId: req.user.userId,
        displayName: req.user.displayName,
        text: text.trim()
      }
    });
    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// WebSocket: JWT-мидлварь
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const payload = verifyToken(token);
  if (!payload) return next(new Error('Unauthorized'));
  socket.data.user = {
    id: payload.userId,
    displayName: payload.displayName
  };
  next();
});

// Подключаем Socket-Handlers
io.on('connection', socket => {
  lobbyHandler(io, socket, prisma);
  chatHandler(io, socket, prisma);
  gameHandler(io, socket, prisma);
  musicHandler(io, socket, prisma);
  voiceHandler(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
