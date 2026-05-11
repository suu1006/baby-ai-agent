import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type BabyDataType = "feeding" | "sleep" | "diaper" | "health" | "all";
export type AnalysisType =
  | "feeding_summary"
  | "sleep_summary"
  | "diaper_summary"
  | "health_summary"
  | "overall";

type FeedingLog = {
  amount_ml?: number | null;
  type?: string | null;
};

type SleepLog = {
  duration_minutes?: number | null;
};

type DiaperLog = {
  type?: string | null;
  changed_at?: string | null;
};

type HealthLog = {
  recorded_at?: string | null;
  type?: string | null;
  title?: string | null;
  value?: string | null;
  memo?: string | null;
};

export function parseTemperatureValue(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function searchBabyData(
  supabase: SupabaseClient,
  childId: string,
  dataType: BabyDataType | string,
  days: number | string,
): Promise<string> {
  const parsedDays = typeof days === "number"
    ? days
    : Number.parseInt(days, 10);
  const safeDays = Number.isFinite(parsedDays) && parsedDays > 0
    ? Math.min(parsedDays, 60)
    : 7;
  const since = new Date();
  since.setDate(since.getDate() - safeDays);
  const sinceISO = since.toISOString();
  const result: Record<string, unknown> = {};

  if (dataType === "feeding" || dataType === "all") {
    const { data, error } = await supabase
      .from("feeding_logs")
      .select("fed_at, amount_ml, type, memo")
      .eq("child_id", childId)
      .gte("fed_at", sinceISO)
      .order("fed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`수유 기록 조회 실패: ${error.message}`);
    result.feeding = data ?? [];
  }

  if (dataType === "sleep" || dataType === "all") {
    const { data, error } = await supabase
      .from("sleep_logs")
      .select("started_at, ended_at, duration_minutes, memo")
      .eq("child_id", childId)
      .gte("started_at", sinceISO)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`수면 기록 조회 실패: ${error.message}`);
    result.sleep = data ?? [];
  }

  if (dataType === "diaper" || dataType === "all") {
    const { data, error } = await supabase
      .from("diaper_logs")
      .select("changed_at, type, memo")
      .eq("child_id", childId)
      .gte("changed_at", sinceISO)
      .order("changed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`기저귀 기록 조회 실패: ${error.message}`);
    result.diaper = data ?? [];
  }

  if (dataType === "health" || dataType === "all") {
    const { data, error } = await supabase
      .from("health_logs")
      .select("recorded_at, type, title, value, memo")
      .eq("child_id", childId)
      .gte("recorded_at", sinceISO)
      .order("recorded_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`건강 기록 조회 실패: ${error.message}`);
    result.health = data ?? [];
  }

  return JSON.stringify(result);
}

export function analyzePattern(
  dataJson: string,
  analysisType: AnalysisType | string,
): string {
  let data: Record<string, unknown[]>;
  try {
    data = JSON.parse(dataJson);
  } catch {
    return "데이터 파싱 오류";
  }

  const summary: Record<string, unknown> = {};

  if (
    (analysisType === "feeding_summary" || analysisType === "overall") &&
    data.feeding
  ) {
    const feedings = data.feeding as FeedingLog[];
    const withAmount = feedings.filter((feeding) => feeding.amount_ml != null);
    const avgAmountMl = withAmount.length > 0
      ? Math.round(
        withAmount.reduce((sum, feeding) => sum + (feeding.amount_ml ?? 0), 0) /
          withAmount.length,
      )
      : null;
    const typeBreakdown = feedings.reduce<Record<string, number>>(
      (acc, feeding) => {
        const type = feeding.type ?? "unknown";
        acc[type] = (acc[type] ?? 0) + 1;
        return acc;
      },
      {},
    );
    summary.feeding = {
      totalCount: feedings.length,
      avgAmountMl,
      typeBreakdown,
    };
  }

  if (
    (analysisType === "sleep_summary" || analysisType === "overall") &&
    data.sleep
  ) {
    const sleeps = data.sleep as SleepLog[];
    const withDuration = sleeps.filter((sleep) =>
      sleep.duration_minutes != null
    );
    const avgDurationMinutes = withDuration.length > 0
      ? Math.round(
        withDuration.reduce(
          (sum, sleep) => sum + (sleep.duration_minutes ?? 0),
          0,
        ) / withDuration.length,
      )
      : null;
    const totalMinutes = withDuration.reduce(
      (sum, sleep) => sum + (sleep.duration_minutes ?? 0),
      0,
    );
    summary.sleep = {
      totalSessions: sleeps.length,
      avgDurationMinutes,
      totalMinutes,
    };
  }

  if (
    (analysisType === "diaper_summary" || analysisType === "overall") &&
    data.diaper
  ) {
    const diapers = data.diaper as DiaperLog[];
    const typeCount = diapers.reduce<Record<string, number>>((acc, diaper) => {
      const type = diaper.type ?? "unknown";
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    const wetCount = (typeCount.wet ?? 0) + (typeCount.urine ?? 0) +
      (typeCount.pee ?? 0) + (typeCount["소변"] ?? 0);
    const dirtyCount = (typeCount.dirty ?? 0) + (typeCount.stool ?? 0) +
      (typeCount.poop ?? 0) + (typeCount["대변"] ?? 0);
    const bothCount = (typeCount.both ?? 0) + (typeCount.mixed ?? 0) +
      (typeCount["소변+대변"] ?? 0);
    const dryCount = (typeCount.dry ?? 0) + (typeCount.change ?? 0) +
      (typeCount["교체"] ?? 0);
    summary.diaper = {
      totalChanges: diapers.length,
      urineCount: wetCount + bothCount,
      stoolCount: dirtyCount + bothCount,
      dryChangeCount: dryCount,
      typeBreakdown: {
        wet: wetCount,
        dirty: dirtyCount,
        both: bothCount,
        dry: dryCount,
      },
      latestChangedAt: diapers[0]?.changed_at ?? null,
    };
  }

  if (
    (analysisType === "health_summary" || analysisType === "overall") &&
    data.health
  ) {
    const healthLogs = data.health as HealthLog[];
    const temperatureLogs = healthLogs.filter((log) =>
      log.type === "temperature"
    );
    const feverRelatedLogs = healthLogs.filter((log) => {
      const text = `${log.title ?? ""} ${log.value ?? ""} ${log.memo ?? ""}`;
      return log.type === "temperature" || text.includes("열") ||
        text.includes("발열") || text.includes("체온");
    });
    const parsedTemperatures = temperatureLogs
      .map((log) => parseTemperatureValue(log.value))
      .filter((value): value is number => value !== null);

    summary.health = {
      totalHealthRecords: healthLogs.length,
      totalTemperatureRecords: temperatureLogs.length,
      latestHealthRecord: healthLogs[0] ?? null,
      latestTemperatureRecord: temperatureLogs[0] ?? null,
      latestFeverRelatedRecord: feverRelatedLogs[0] ?? null,
      maxTemperatureCelsius: parsedTemperatures.length > 0
        ? Math.max(...parsedTemperatures)
        : null,
      records: healthLogs.slice(0, 10),
    };
  }

  return JSON.stringify(summary);
}
