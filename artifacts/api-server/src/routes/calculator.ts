import { Router, type IRouter } from "express";
import { RunCalculatorBody } from "@workspace/api-zod";
import { calculateLoan } from "../lib/loan";

const router: IRouter = Router();
router.post("/calculator", (req, res) => {
  res.json(calculateLoan(RunCalculatorBody.parse(req.body)));
});
export default router;
