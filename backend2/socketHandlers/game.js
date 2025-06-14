import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_NAME;
// Эфемерное хранилище состояния
const gameStates = {};

export default function gameHandler(io, socket, prisma) {
  const userId = socket.data.user.id;
  const room   = id => `lobby-${id}`;

  socket.on('getGameState', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const [maps, tokenResources] = await Promise.all([
        prisma.map.findMany({ where: { lobbyId: id }, orderBy: { uploadedAt: 'asc' } }),
        prisma.token.findMany({ where: { lobbyId: id }, orderBy: { uploadedAt: 'asc' } })
      ]);
      gameStates[id] ||= { tokens: [] };
      cb({ maps, tokenResources, placedTokens: gameStates[id].tokens });
    } catch (err) {
      console.error('getGameState error', err);
      cb({ error: 'Failed to load game state' });
    }
  });

  socket.on('uploadMap', async ({ lobbyId, fileName, mimeType, fileBuffer }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const key = `${id}/maps/${Date.now()}_${fileName}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key,
        Body: Buffer.from(fileBuffer), ContentType: mimeType
      }));
      const url = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      const map = await prisma.map.create({ data: { lobbyId: id, name: fileName, url } });
      io.to(room(id)).emit('mapUploaded', map);
      cb({ success: true, map });
    } catch (err) {
      console.error('uploadMap error', err);
      cb({ error: 'Upload failed' });
    }
  });

  socket.on('removeMap', async ({ id: mapId, lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    try {
      const map = await prisma.map.delete({ where: { id: mapId } });
      const key = map.url.split(`.${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      io.to(room(lid)).emit('mapRemoved', { id: mapId });
      cb({ success: true });
    } catch (err) {
      console.error('removeMap error', err);
      cb({ error: 'Removal failed' });
    }
  });

  socket.on('placeToken', ({ lobbyId, resourceId, x, y, radius, color }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    gameStates[id] ||= { tokens: [] };
    const placement = { id: uuidv4(), resourceId, x, y, radius, color, placedBy: userId };
    gameStates[id].tokens.push(placement);
    io.to(room(id)).emit('tokenPlaced', placement);
    cb({ success: true, placement });
  });

  socket.on('moveToken', ({ lobbyId, id, x, y }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    const state = gameStates[lid];
    const tok = state?.tokens.find(t => t.id === id);
    if (!tok) return cb({ error: 'Token not found' });
    tok.x = x; tok.y = y;
    io.to(room(lid)).emit('tokenMoved', tok);
    cb({ success: true, tok });
  });

  socket.on('removeToken', ({ lobbyId, id }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    const state = gameStates[lid];
    if (!state) return cb({ error: 'Lobby not found' });
    state.tokens = state.tokens.filter(t => t.id !== id);
    io.to(room(lid)).emit('tokenRemoved', { id });
    cb({ success: true });
  });

  socket.on('endGame', ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (!isNaN(id)) delete gameStates[id];
    io.to(room(id)).emit('gameEnded');
    cb({ success: true });
  });
}
