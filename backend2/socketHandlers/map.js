import fs from 'fs';
import path from 'path';

export default function mapHandler(io, socket, prisma) {
  const userId = socket.data.user.id;
  const room   = id => `lobby-${id}`;

  socket.on('getMaps', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const maps = await prisma.map.findMany({
        where: { lobbyId: id }, orderBy: { uploadedAt: 'asc' }
      });
      cb({ maps });
    } catch (err) {
      console.error('getMaps error', err);
      cb({ error: 'Failed to load maps' });
    }
  });

  socket.on('uploadMap', async ({ lobbyId, name, fileBuffer }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const dir = path.join(process.cwd(), 'uploads', 'maps');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}_${name}`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, Buffer.from(fileBuffer));
      const url = `/uploads/maps/${filename}`;

      const map = await prisma.map.create({ data: { lobbyId: id, name, url } });
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
      const filepath = path.join(process.cwd(), map.url.replace(/^\//, ''));
      fs.unlinkSync(filepath);
      io.to(room(lid)).emit('mapRemoved', { id: mapId });
      cb({ success: true });
    } catch (err) {
      console.error('removeMap error', err);
      cb({ error: 'Removal failed' });
    }
  });
}
