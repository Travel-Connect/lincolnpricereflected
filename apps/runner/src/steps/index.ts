/**
 * Step registry — maps step names to their run functions.
 */

import type { Page } from "playwright";
import type { Job, StepName } from "../job-state.js";
import { run as runParse } from "./step-parse.js";
import { run as runStep0 } from "./step0.js";
import { run as runStepA } from "./step-a.js";
import { run as runStepB } from "./step-b.js";
import { run as runStepC } from "./step-c.js";

type StepFn = (jobId: string, page: Page, job: Job) => Promise<void>;

export const STEP_REGISTRY: Record<StepName, StepFn> = {
  PARSE: runParse,
  STEPA: runStepA,
  STEP0: runStep0,
  STEPB: runStepB,
  STEPC: runStepC,
};
