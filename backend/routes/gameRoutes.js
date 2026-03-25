import express from "express";
import {
  addBuilding,
  deleteBuilding,
  getBuildings,
  getGameState,
  getWarTarget,
  updateBuilding,
  updateGameState,
} from "../controller/gameController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/state", protect, getGameState);
router.put("/state", protect, updateGameState);
router.post("/build", protect, addBuilding);
router.get("/buildings", protect, getBuildings);
router.get("/war-target", protect, getWarTarget);
router.put("/buildings/:id", protect, updateBuilding);
router.delete("/buildings/:id", protect, deleteBuilding);

export default router;
