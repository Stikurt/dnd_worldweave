import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET_NAME;

export default function musicHandler(io, socket, prisma) {
  const userId = socket.data.user.id;
  const room   = id => `lobby-${id}`;

  socket.on('getMusic', async ({ lobbyId }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const tracks = await prisma.music.findMany({
        where: { lobbyId: id }, orderBy: { uploadedAt: 'asc' }
      });
      cb({ tracks });
    } catch (err) {
      console.error('getMusic error', err);
      cb({ error: 'Failed to load music' });
    }
  });

  socket.on('uploadMusic', async ({ lobbyId, name, mimeType, duration, fileBuffer }, cb) => {
    const id = parseInt(lobbyId, 10);
    if (isNaN(id)) return cb({ error: 'Invalid lobbyId' });
    try {
      const key = `${id}/music/${Date.now()}_${name}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key,
        Body: Buffer.from(fileBuffer), ContentType: mimeType
      }));
      const url = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
      const track = await prisma.music.create({
        data: { lobbyId: id, name, url, mimeType, duration }
      });
      io.to(room(id)).emit('musicUploaded', track);
      cb({ success: true, track });
    } catch (err) {
      console.error('uploadMusic error', err);
      cb({ error: 'Upload failed' });
    }
  });

  socket.on('removeMusic', async ({ id: trackId, lobbyId }, cb) => {
    const lid = parseInt(lobbyId, 10);
    if (isNaN(lid)) return cb({ error: 'Invalid lobbyId' });
    try {
      const track = await prisma.music.delete({ where: { id: trackId } });
      const key = track.url.split(`.${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      io.to(room(lid)).emit('musicRemoved', { id: trackId });
      cb({ success: true });
    } catch (err) {
      console.error('removeMusic error', err);
      cb({ error: 'Removal failed' });
    }
  });
}
  