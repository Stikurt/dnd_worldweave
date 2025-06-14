const userSockets = {};

export default function voiceHandler(io, socket) {
  const uid = socket.data.user.id;
  userSockets[uid] = socket.id;

  socket.on('peer-join', ({ lobbyId }) => {
    const lid = parseInt(lobbyId, 10);
    if (!isNaN(lid)) socket.to(`lobby-${lid}`).emit('peer-join', uid);
  });

  socket.on('signal', ({ to, signal }) => {
    const sid = userSockets[to];
    if (sid) io.to(sid).emit('signal', { from: uid, signal });
  });

  socket.on('voice-status', ({ lobbyId, speaking }) => {
    const lid = parseInt(lobbyId, 10);
    if (!isNaN(lid)) io.to(`lobby-${lid}`).emit('voice-status', { userId: uid, speaking });
  });

  socket.on('disconnect', () => {
    delete userSockets[uid];
  });
}
