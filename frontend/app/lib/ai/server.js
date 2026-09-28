import "server-only";
import daily from "../../data/daily.json";
import performance from "../../data/performance.json";
import trend from "../../data/amc_trend.json";
import { getFund, allFunds, cohortOf } from "../funds";
import {
  visibleReturns,
  benchmarkRows,
  riskInterpretation,
} from "../fundAnalysis";
import { marketIntel } from "../intel";
import { sb } from "../supabase";
import { buildContext } from "./context.mjs";
export const contextFor = (request) =>
  buildContext(request, {
    daily,
    performance,
    trend,
    getFund,
    allFunds,
    cohortOf,
    visibleReturns,
    benchmarkRows,
    riskInterpretation,
    marketIntel,
    sb,
  });
