import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzePattern, parseTemperatureValue } from "./baby-data.ts";

Deno.test("analyzePattern counts diaper wet, dirty, both, and dry correctly", () => {
  const result = analyzePattern(
    JSON.stringify({
      diaper: [
        { type: "wet", changed_at: "2026-05-11T09:00:00.000Z" },
        { type: "both", changed_at: "2026-05-11T08:00:00.000Z" },
        { type: "dirty", changed_at: "2026-05-11T07:00:00.000Z" },
        { type: "dry", changed_at: "2026-05-11T06:00:00.000Z" },
      ],
    }),
    "diaper_summary",
  );

  const parsed = JSON.parse(result);
  assertEquals(parsed.diaper.totalChanges, 4);
  assertEquals(parsed.diaper.urineCount, 2);
  assertEquals(parsed.diaper.stoolCount, 2);
  assertEquals(parsed.diaper.dryChangeCount, 1);
  assertEquals(parsed.diaper.latestChangedAt, "2026-05-11T09:00:00.000Z");
});

Deno.test("analyzePattern preserves health value strings and computes max parsed temperature", () => {
  const result = analyzePattern(
    JSON.stringify({
      health: [
        {
          type: "temperature",
          title: "체온",
          value: "38.2℃",
          memo: "미열",
          recorded_at: "2026-05-11T09:00:00.000Z",
        },
        {
          type: "temperature",
          title: "체온",
          value: "37,6도",
          memo: null,
          recorded_at: "2026-05-11T08:00:00.000Z",
        },
      ],
    }),
    "health_summary",
  );

  const parsed = JSON.parse(result);
  assertEquals(parsed.health.latestTemperatureRecord.value, "38.2℃");
  assertEquals(parsed.health.maxTemperatureCelsius, 38.2);
});

Deno.test("parseTemperatureValue accepts comma decimal values", () => {
  assertEquals(parseTemperatureValue("37,6도"), 37.6);
  assertEquals(parseTemperatureValue("값 없음"), null);
});
