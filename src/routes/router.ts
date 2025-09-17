import { Router } from "express";

const router = Router();

router.get("/", (req, res) => res.json({ message: "Hello from Docker v3 🎉" }));

router.get("/health", (req, res) => {
  res.status(200).json({ message: "Everything is good here 👀" });
});

// New route to show environment variables
router.get("/env", (req, res) => {
  res.json({
    node_env: process.env.NODE_ENV || "not set",
    all_envs: process.env, // ⚠️ shows everything (only for debugging!)
  });
});

export default router;
