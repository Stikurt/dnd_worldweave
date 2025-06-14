import { setLobbyExpiry } from '../utils/tokenManager.js';

export default function lobbyHandler(io, socket, prisma) {
  const roomName = (id) => `lobby-${id}`;
  const getUserId = () => socket.data.user.id;

  // Отправляет всем в комнате актуальный список игроков
  async function broadcastPlayers(lobbyId) {
    // Включаем и user, и lobby (чтобы узнать masterId)
    const rel = await prisma.lobbyPlayer.findMany({
      where: { lobbyId },
      include: {
        user: true,
        lobby: true,
      },
    });

    io.to(roomName(lobbyId)).emit(
      'lobbyPlayers',
      rel.map((lp) => ({
        userId: lp.user.id,
        displayName: lp.user.displayName || 'Anon',
        isMaster: lp.user.id === lp.lobby.masterId,
        joinedAt: lp.joinedAt,
      }))
    );
  }

  // Создать лобби
  socket.on('createLobby', async ({ name }, cb) => {
    name = name?.trim();
    if (!name) return cb({ error: 'Name required' });

    try {
      const masterId = getUserId();
      const lobby = await prisma.lobby.create({
        data: { name, masterId },
      });
      await setLobbyExpiry(lobby.id);

      // Сам себя сразу добавляем как игрока
      await prisma.lobbyPlayer.create({
        data: { lobbyId: lobby.id, userId: masterId },
      });

      socket.join(roomName(lobby.id));
      cb({ lobbyId: lobby.id, name: lobby.name, masterId });

      await broadcastPlayers(lobby.id);
    } catch (err) {
      console.error('createLobby error', err);
      cb({ error: 'Failed to create lobby' });
    }
  });

  // Присоединиться к лобби
  socket.on('joinLobby', async ({ lobbyId }, cb = () => {}) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });

    try {
      const lobby = await prisma.lobby.findUnique({ where: { id } });
      if (!lobby) return cb({ error: 'Lobby not found' });

      try {
        await prisma.lobbyPlayer.create({
          data: { lobbyId: id, userId: getUserId() },
        });
      } catch (err) {
        // Игнорируем ошибку уникальности, если игрок уже в лобби
        if (err.code !== 'P2002') throw err;
      }

      socket.join(roomName(id));
      cb({ lobbyId: id, name: lobby.name, masterId: lobby.masterId });

      await broadcastPlayers(id);
    } catch (err) {
      console.error('joinLobby error', err);
      cb({ error: 'Failed to join lobby' });
    }
  });

  // Кикнуть игрока (только мастер)
  socket.on('kickPlayer', async ({ lobbyId, userId: targetId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    const me = getUserId();
    if (me === targetId) return cb({ error: 'Cannot kick yourself' });

    try {
      const lobby = await prisma.lobby.findUnique({ where: { id } });
      if (!lobby) return cb({ error: 'Lobby not found' });
      if (lobby.masterId !== me) return cb({ error: 'Only master can kick' });

      await prisma.lobbyPlayer.deleteMany({
        where: { lobbyId: id, userId: targetId },
      });

      io.to(roomName(id)).emit('playerKicked', { userId: targetId });
      await broadcastPlayers(id);

      cb({ success: true });
    } catch (err) {
      console.error('kickPlayer error', err);
      cb({ error: 'Failed to kick player' });
    }
  });

  // Выйти из лобби
  socket.on('leaveLobby', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    const me = getUserId();

    try {
      // Удаляем самого себя из лобби
      await prisma.lobbyPlayer.deleteMany({
        where: { lobbyId: id, userId: me },
      });
      socket.leave(roomName(id));

      const lobby = await prisma.lobby.findUnique({ where: { id } });
      if (lobby?.masterId === me) {
        // Если мастер ушел — удаляем чат и игроков, затем само лобби
        await prisma.chatMessage.deleteMany({ where: { lobbyId: id } });
        await prisma.lobbyPlayer.deleteMany({ where: { lobbyId: id } });
        await prisma.lobby.delete({ where: { id } });
        io.to(roomName(id)).emit('lobbyClosed');
      } else {
        // Обычный выход — обновляем список
        await broadcastPlayers(id);
      }

      cb({ success: true });
    } catch (err) {
      console.error('leaveLobby error', err);
      cb({ error: 'Failed to leave lobby' });
    }
  });

  // Запустить игру (только мастер)
  socket.on('startGame', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    const me = getUserId();

    try {
      const lobby = await prisma.lobby.findUnique({ where: { id } });
      if (!lobby) return cb({ error: 'Lobby not found' });
      if (lobby.masterId !== me) return cb({ error: 'Only master can start' });

      io.to(roomName(id)).emit('gameStarted', { lobbyId: id });
      cb({ success: true });
    } catch (err) {
      console.error('startGame error', err);
      cb({ error: 'Failed to start game' });
    }
  });
}
