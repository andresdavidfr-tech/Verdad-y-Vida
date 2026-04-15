import { ReadingDay } from "../types";
import { PLAN_PART_1 } from "./plan-data-1";
import { PLAN_PART_2 } from "./plan-data-2";

export function generateReadingPlan(): ReadingDay[] {
  const allRawData = [...PLAN_PART_1, ...PLAN_PART_2];
  
  return allRawData.map((line, index) => {
    const [ot, nt] = line.split('|');
    return {
      day: index + 1,
      ot: ot || "",
      nt: nt || ""
    };
  });
}

export const READING_PLAN = generateReadingPlan();

export function getDayOfYear(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - startOfYear.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay) + 1;
  
  // 2-year cycle logic:
  // Even years (like 2026) are Year 1 (Days 1-365/366)
  // Odd years (like 2027) are Year 2 (Days 367-730)
  const isYear2 = now.getFullYear() % 2 !== 0;
  
  // Normalize to 364 days per year for the 728-day plan
  // (This handles leap years and the 365th day by wrapping or capping)
  const normalizedDay = Math.min(dayOfYear, 364);
  
  return isYear2 ? normalizedDay + 364 : normalizedDay;
}
