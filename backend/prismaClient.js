import dotenv from "dotenv";
import prismaPkg from "@prisma/client";

dotenv.config();

const isPostgresUrl = (value) => /^(postgresql|postgres):\/\//i.test(String(value ?? "").trim());
const resolveDatasourceUrl = () => {
  if (isPostgresUrl(process.env.DATABASE_URL)) {
    return process.env.DATABASE_URL.trim();
  }

  if (isPostgresUrl(process.env.DIRECT_URL)) {
    return process.env.DIRECT_URL.trim();
  }

  return process.env.DATABASE_URL;
};

const { PrismaClient } = prismaPkg;

const prisma = new PrismaClient({
  datasourceUrl: resolveDatasourceUrl(),
});

export default prisma;
