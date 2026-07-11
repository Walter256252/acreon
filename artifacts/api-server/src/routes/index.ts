import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";
import calculatorRouter from "./calculator";
import openaiRouter from "./openai/index";
import projectionsRouter from "./projections";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(calculatorRouter);
router.use(openaiRouter);
router.use(projectionsRouter);

export default router;
