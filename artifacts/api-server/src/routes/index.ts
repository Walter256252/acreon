import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";
import calculatorRouter from "./calculator";
import openaiRouter from "./openai/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(calculatorRouter);
router.use(openaiRouter);

export default router;
