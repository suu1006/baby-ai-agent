import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSystemPrompt, calculateAgeInMonths } from "./prompt.ts";

Deno.test("calculateAgeInMonths returns completed month difference", () => {
  const age = calculateAgeInMonths(
    "2025-01-15",
    new Date("2026-05-11T00:00:00.000Z"),
  );
  assertEquals(age, 16);
});

Deno.test("buildSystemPrompt includes child identity and exact-record rules", () => {
  const prompt = buildSystemPrompt(
    { id: "child-1", name: "하린", birthdate: "2025-01-15" },
    new Date("2026-05-11T00:00:00.000Z"),
  );

  assertStringIncludes(prompt, "당신은 하린의 전담 육아 AI 어시스턴트입니다.");
  assertStringIncludes(prompt, "- 이름: 하린");
  assertStringIncludes(prompt, "- 나이: 1세 4개월");
  assertStringIncludes(
    prompt,
    "대화에 아이 기록 데이터가 제공된 경우 반드시 그 숫자를 그대로 사용하여 답변",
  );
  assertStringIncludes(
    prompt,
    "체온/열 질문은 건강 기록의 value 값을 반올림하거나 추정하지 말고 기록된 문자열 그대로 답변",
  );
});
