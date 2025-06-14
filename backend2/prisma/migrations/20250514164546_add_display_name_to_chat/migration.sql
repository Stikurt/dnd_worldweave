/*
  Warnings:

  - Added the required column `displayName` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "displayName" TEXT NOT NULL;
