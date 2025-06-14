export default function chatHandler(io, socket, prisma) {
  const roomName = id => `lobby-${id}`;
  const userId    = socket.data.user.id;
  const nick      = socket.data.user.displayName;

  // Загрузка истории чата
  socket.on('getChatHistory', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });

    try {
      const messages = await prisma.chatMessage.findMany({
        where: { lobbyId: id },
        orderBy: { createdAt: 'asc' }
      });
      cb({ messages });
    } catch (err) {
      console.error('getChatHistory error', err);
      cb({ error: 'Failed to load chat history' });
    }
  });

  // Отправка текстового сообщения
  socket.on('sendMessage', async ({ lobbyId, text }, cb) => {
    const id = parseInt(lobbyId, 10);
    text = text?.trim();
    if (isNaN(id))    return cb({ error: 'Invalid lobbyId' });
    if (!text)        return cb({ error: 'Text required' });

    try {
      const msg = await prisma.chatMessage.create({
        data: {
          lobbyId:     id,
          userId,
          displayName: nick,
          text
        }
      });
      io.to(roomName(id)).emit('newMessage', msg);
      cb({ success: true });
    } catch (err) {
      console.error('sendMessage error', err);
      cb({ error: 'Failed to send message' });
    }
  });

  // Бросок кубиков выводим в чат
  socket.on('rollDice', async ({ lobbyId, diceType, diceCount }, cb) => {
    const id    = parseInt(lobbyId, 10);
    const type  = parseInt(diceType, 10);
    const count = parseInt(diceCount, 10);
    if (isNaN(id) || isNaN(type) || isNaN(count) || type < 1 || count < 1) {
      return cb({ error: 'Invalid dice parameters' });
    }

    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * type) + 1;
      rolls.push(r);
      total += r;
    }
    const text = `${nick} бросил ${count}d${type}: [${rolls.join(', ')}] (итого ${total})`;

    try {
      const msg = await prisma.chatMessage.create({
        data: {
          lobbyId:     id,
          userId,
          displayName: nick,
          text
        }
      });
      io.to(roomName(id)).emit('newMessage', msg);
      cb({ success: true });
    } catch (err) {
      console.error('rollDice error', err);
      cb({ error: 'Failed to roll dice' });
    }
  });
}
