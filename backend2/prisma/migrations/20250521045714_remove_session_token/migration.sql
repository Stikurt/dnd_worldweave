-- AlterTable
ALTER TABLE "Lobby" ADD COLUMN     "masterId" INTEGER;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
