import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";
import calculatorRouter from "./calculator";
import openaiRouter from "./openai/index";
import projectionsRouter from "./projections";
import emailRouter from "./email";
import settingsRouter from "./settings";
import adminRouter from "./admin";
import propertiesGeoRouter from "./propertiesGeo";
import occupancyRouter from "./occupancy";

const router: IRouter = Router();

// ── Public routes (no auth required) ──────────────────────────────────────
router.use(healthRouter);

// ── Global auth middleware — all routes below require authentication ────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireAuth);

// ── Protected routes ───────────────────────────────────────────────────────
router.use(propertiesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(calculatorRouter);
router.use(openaiRouter);
router.use(projectionsRouter);
router.use(emailRouter);
router.use(settingsRouter);
router.use(adminRouter);
router.use(propertiesGeoRouter);
router.use(occupancyRouter);

export default router;
