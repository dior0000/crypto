import { describe, expect, it } from "vitest";

import { validateObservation } from "../guardrailValidator.js";

describe("validateObservation", () => {
  it("пропускает объективное наблюдение без прогнозов", () => {
    const result = validateObservation({
      summary: "Цена третий раз за сессию подходит к уровню 105.20, объём выше среднего за последний час.",
      questions: ["Где будет стоп, если уровень не удержит?", "Какой у тебя R:R на этом входе?"],
      behaviorFlags: [],
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("блокирует направленный прогноз в summary", () => {
    const result = validateObservation({
      summary: "Цена пойдёт вверх, открывай лонг прямо сейчас.",
      questions: [],
      behaviorFlags: [],
    });

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "DIRECTIONAL_FORECAST")).toBe(true);
  });

  it("блокирует вероятность движения в процентах", () => {
    const result = validateObservation({
      summary: "Вероятность роста 80% в течение часа.",
      questions: [],
      behaviorFlags: [],
    });

    expect(result.ok).toBe(false);
  });

  it("блокирует лишние поля (например direction) через .strict()", () => {
    const result = validateObservation({
      summary: "Цена у уровня 105.20.",
      questions: [],
      behaviorFlags: [],
      direction: "up",
    });

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.category === "SCHEMA_VIOLATION")).toBe(true);
  });

  it("блокирует нарушение внутри вложенного поля behaviorFlags", () => {
    const result = validateObservation({
      summary: "Пользователь открыл пятую сделку за час.",
      questions: [],
      behaviorFlags: [{ kind: "OVERTRADING", note: "Похоже, скоро цена вырастет, будь осторожен." }],
    });

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.field.includes("behaviorFlags"))).toBe(true);
  });
});
