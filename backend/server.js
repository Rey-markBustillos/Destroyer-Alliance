import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";

import authRoutes from "./routes/authRoutes.js";
import gameRoutes from "./routes/gameRoutes.js";
import prisma from "./prismaClient.js";
import { createBattleSocketServer } from "./socket/battleServer.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);

// TEST
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

const PORT = process.env.PORT || 5000;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 5000);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDatabaseWithRetry = async () => {
  // In production we still fail fast so the host can restart the process.
  const shouldRetry = process.env.NODE_ENV !== "production";

  while (true) {
    try {
      await prisma.$connect();
      console.log("Database connected successfully");
      return;
    } catch (error) {
      console.error("Database connection failed:", error.message);

      if (!shouldRetry) {
        process.exit(1);
      }

      console.log(
        `Retrying database connection in ${DB_RETRY_DELAY_MS}ms...`
      );
      await wait(DB_RETRY_DELAY_MS);
    }
  }
};

const startServer = async () => {
  await connectDatabaseWithRetry();
  createBattleSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
