/*
  Warnings:

  - You are about to drop the `ABC` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ABC";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "To_do_lists" (
    "id" SERIAL NOT NULL,
    "owners" TEXT[],
    "to_DOs" JSONB NOT NULL,

    CONSTRAINT "To_do_lists_pkey" PRIMARY KEY ("id")
);
