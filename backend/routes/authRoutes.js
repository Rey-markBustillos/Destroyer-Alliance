import express from "express";
import { registerUser, loginUser, getProfile, updateProfileName } from "../controller/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getProfile);
router.patch("/profile/name", protect, updateProfileName);

export default router;
