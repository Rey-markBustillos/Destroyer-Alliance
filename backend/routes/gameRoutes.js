import express from "express";
import {
  addBuilding,
  applyWarResolution,
  deleteBuilding,
  getBuildings,
  getGameSnapshot,
  getWarEnemies,
  getGameState,
  getWarTarget,
  syncGameSnapshot,
  updateBuilding,
  updateGameState,
} from "../controller/gameController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/state", protect, getGameState);
router.put("/state", protect, updateGameState);
router.get("/snapshot", protect, getGameSnapshot);
router.put("/snapshot", protect, syncGameSnapshot);
router.post("/build", protect, addBuilding);
router.get("/buildings", protect, getBuildings);
router.get("/war-enemies", protect, getWarEnemies);
router.get("/war-target", protect, getWarTarget);
router.post("/war-resolution", protect, applyWarResolution);
router.put("/buildings/:id", protect, updateBuilding);
router.delete("/buildings/:id", protect, deleteBuilding);

export default router;
