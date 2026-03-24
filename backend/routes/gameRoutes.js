import express from "express";
import { addBuilding, deleteBuilding, getBuildings, updateBuilding } from "../controller/gameController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/build", protect, addBuilding);
router.get("/buildings", protect, getBuildings);
router.put("/buildings/:id", protect, updateBuilding);
router.delete("/buildings/:id", protect, deleteBuilding);

export default router;
