import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../prisma/prisma.service";
import { BehaviorFlagsService } from "../behavior-flags.service";

interface FakeJournalEntry {
  createdAt: Date;
  side: string | null;
  stop: number | null;
  outcome: string | null;
  closedAt: Date | null;
}

function createPrismaMock(entries: FakeJournalEntry[], existingFlag: unknown = null) {
  const create = vi.fn().mockResolvedValue({});
  const findFirst = vi.fn().mockResolvedValue(existingFlag);

  const prisma = {
    journalEntry: { findMany: vi.fn().mockResolvedValue(entries) },
    behaviorFlag: { findFirst, create },
  } as unknown as PrismaService;

  return { prisma, create, findFirst };
}

function entryAt(hoursAgo: number, overrides: Partial<FakeJournalEntry> = {}): FakeJournalEntry {
  return {
    createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    side: null,
    stop: null,
    outcome: null,
    closedAt: null,
    ...overrides,
  };
}

describe("BehaviorFlagsService.evaluateForUser", () => {
  it("флагует овертрейдинг при 3+ сделках за 24 часа", async () => {
    const { prisma, create } = createPrismaMock([entryAt(1), entryAt(5), entryAt(10)]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "OVERTRADING" }) }),
    );
  });

  it("не флагует овертрейдинг при 2 сделках за 24 часа", async () => {
    const { prisma, create } = createPrismaMock([entryAt(1), entryAt(5)]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "OVERTRADING" }) }),
    );
  });

  it("флагует вход без стопа, если последняя сделка направленная и без стопа", async () => {
    const { prisma, create } = createPrismaMock([entryAt(0.1, { side: "LONG", stop: null })]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "NO_STOP" }) }));
  });

  it("не флагует NO_STOP, если стоп указан", async () => {
    const { prisma, create } = createPrismaMock([entryAt(0.1, { side: "LONG", stop: 100 })]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "NO_STOP" }) }),
    );
  });

  it("флагует revenge-трейдинг: новая сделка в течение 30 минут после закрытого убытка", async () => {
    const lossClosedAt = new Date(Date.now() - 10 * 60 * 1000);
    const { prisma, create } = createPrismaMock([
      entryAt(0, { side: "LONG", stop: 100 }),
      entryAt(0.2, { outcome: "LOSS", closedAt: lossClosedAt }),
    ]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "REVENGE" }) }));
  });

  it("не флагует revenge-трейдинг, если убыток закрыт больше 30 минут назад", async () => {
    const lossClosedAt = new Date(Date.now() - 90 * 60 * 1000);
    const { prisma, create } = createPrismaMock([
      entryAt(0, { side: "LONG", stop: 100 }),
      entryAt(1.5, { outcome: "LOSS", closedAt: lossClosedAt }),
    ]);
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "REVENGE" }) }),
    );
  });

  it("не создаёт дубликат флага, если такой же кайнд уже зафиксирован недавно", async () => {
    const { prisma, create } = createPrismaMock([entryAt(1), entryAt(5), entryAt(10)], {
      id: "existing",
      kind: "OVERTRADING",
    });
    const service = new BehaviorFlagsService(prisma);

    await service.evaluateForUser("user-1");

    expect(create).not.toHaveBeenCalled();
  });
});
