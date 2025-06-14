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
      gameStates[id] ||= { tokens: [], maps: {}, strokes: [], undo: {} };
      const mapStates = gameStates[id].maps;
      const mapsWithState = maps.map(m => ({
        ...m,
        ...(mapStates[m.id] || { x: 0, y: 0, scale: 1 })
      }));
      cb({ maps: mapsWithState, tokenResources, placedTokens: gameStates[id].tokens, strokes: gameStates[id].strokes });
    } catch (err) {
      console.error('getGameState error', err);
      cb({ error: 'Failed to load game state' });
    }
  });

  socket.on('uploadMap', async ({ lobbyId, fileName, mimeType, fileBuffer }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const lobby = await prisma.lobby.findUnique({ where: { id } });
      if (!lobby) return cb({ error: 'Lobby not found' });
      if (lobby.masterId !== userId) return cb({ error: 'Only master can upload' });

      if (!process.env.AWS_REGION || !BUCKET) {
        console.error('uploadMap error', 'S3 not configured');
        return cb({ error: 'Storage not configured' });
      }

      const key = `${id}/maps/${Date.now()}_${fileName}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key,
        Body: Buffer.from(fileBuffer), ContentType: mimeType
      }));
      const url = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      const map = await prisma.map.create({ data: { lobbyId: id, name: fileName, url } });
      gameStates[id] ||= { tokens: [], maps: {}, strokes: [], undo: {} };
      gameStates[id].maps[map.id] = { x: 0, y: 0, scale: 1 };
      io.to(room(id)).emit('mapUploaded', { ...map, x: 0, y: 0, scale: 1 });
      cb({ success: true, map: { ...map, x: 0, y: 0, scale: 1 } });
    } catch (err) {
      console.error('uploadMap error', err);
      cb({ error: 'Upload failed' });
    }
  });

  socket.on('removeMap', async ({ id: mapId, lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    try {
      const lobby = await prisma.lobby.findUnique({ where: { id: lid } });
      if (!lobby) return cb({ error: 'Lobby not found' });
      if (lobby.masterId !== userId) return cb({ error: 'Only master can remove' });

      const map = await prisma.map.delete({ where: { id: mapId } });
      const key = map.url.split(`.${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      gameStates[lid]?.maps && delete gameStates[lid].maps[mapId];
      io.to(room(lid)).emit('mapRemoved', { id: mapId });
      cb({ success: true });
    } catch (err) {
      console.error('removeMap error', err);
      cb({ error: 'Removal failed' });
    }
  });

  socket.on('updateMap', async ({ lobbyId, id, x, y, scale }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    const lobby = await prisma.lobby.findUnique({ where: { id: lid } });
    if (!lobby) return cb({ error: 'Lobby not found' });
    if (lobby.masterId !== userId) return cb({ error: 'Only master can update' });

    const state = gameStates[lid];
    const mapState = state?.maps?.[id];
    if (!mapState) return cb({ error: 'Map not found' });
    Object.assign(mapState, {
      x: typeof x === 'number' ? x : mapState.x,
      y: typeof y === 'number' ? y : mapState.y,
      scale: typeof scale === 'number' ? scale : mapState.scale
    });
    io.to(room(lid)).emit('mapUpdated', { id, x: mapState.x, y: mapState.y, scale: mapState.scale });
    cb({ success: true });
  });

  socket.on('placeToken', ({ lobbyId, resourceId, x, y, radius, color }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    gameStates[id] ||= { tokens: [], maps: {}, strokes: [], undo: {} };
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

  socket.on('drawStroke', ({ lobbyId, color, width, points }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    gameStates[lid] ||= { tokens: [], maps: {}, strokes: [], undo: {} };
    const stroke = { id: uuidv4(), userId, color, width, points };
    gameStates[lid].strokes.push(stroke);
    io.to(room(lid)).emit('strokeDrawn', stroke);
    cb({ success: true, stroke });
  });

  socket.on('undoStroke', ({ lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    const state = gameStates[lid];
    if (!state) return cb({ error: 'Lobby not found' });
    const idx = [...state.strokes].map(s => s.userId).lastIndexOf(userId);
    if (idx === -1) return cb({ error: 'Nothing to undo' });
    const [stroke] = state.strokes.splice(idx, 1);
    state.undo[userId] ||= [];
    state.undo[userId].push(stroke);
    io.to(room(lid)).emit('strokeRemoved', { id: stroke.id });
    cb({ success: true });
  });

  socket.on('redoStroke', ({ lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    const state = gameStates[lid];
    if (!state) return cb({ error: 'Lobby not found' });
    const stack = state.undo[userId];
    if (!stack || !stack.length) return cb({ error: 'Nothing to redo' });
    const stroke = stack.pop();
    state.strokes.push(stroke);
    io.to(room(lid)).emit('strokeDrawn', stroke);
    cb({ success: true, stroke });
  });

  socket.on('endGame', ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (!isNaN(id)) delete gameStates[id];
    io.to(room(id)).emit('gameEnded');
    cb({ success: true });
  });
}
