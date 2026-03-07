import { PrismaClient, Prisma } from "../../generated/prisma/client";
export { Prisma };
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });
