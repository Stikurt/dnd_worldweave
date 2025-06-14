import fs from 'fs';
import path from 'path';

export default function tokenHandler(io, socket, prisma) {
  const userId = socket.data.user.id;
  const room   = id => `lobby-${id}`;

  socket.on('getTokens', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const tokens = await prisma.token.findMany({
        where: { lobbyId: id }, orderBy: { uploadedAt: 'asc' }
      });
      cb({ tokens });
    } catch (err) {
      console.error('getTokens error', err);
      cb({ error: 'Failed to load tokens' });
    }
  });

  socket.on('uploadToken', async ({ lobbyId, name, fileBuffer }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const dir = path.join(process.cwd(), 'uploads', 'tokens');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}_${name}`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, Buffer.from(fileBuffer));
      const url = `/uploads/tokens/${filename}`;

      const tok = await prisma.token.create({ data: { lobbyId: id, name, url } });
      io.to(room(id)).emit('tokenUploaded', tok);
      cb({ success: true, token: tok });
    } catch (err) {
      console.error('uploadToken error', err);
      cb({ error: 'Upload failed' });
    }
  });

  socket.on('removeToken', async ({ id: tokId, lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    try {
      const tok = await prisma.token.delete({ where: { id: tokId } });
      const filepath = path.join(process.cwd(), tok.url.replace(/^\//, ''));
      fs.unlinkSync(filepath);
      io.to(room(lid)).emit('tokenRemoved', { id: tokId });
      cb({ success: true });
    } catch (err) {
      console.error('removeToken error', err);
      cb({ error: 'Removal failed' });
    }
  });
}
