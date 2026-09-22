/**
 * Cycle dates that can be shifted to align with the planning window
 */
interface ShiftableCycle {
  readonly startDate: Date;
  readonly floweringDate: Date;
  readonly harvestingDate: Date;
  readonly endDate: Date;
}

export class PlanningWindow {
  private readonly startAtIso?: string;
  private readonly endAtIso?: string;

  constructor(input?: { readonly startAt?: Date; readonly endAt?: Date }) {
    this.startAtIso = input?.startAt ? PlanningWindow.toIsoDate(input.startAt) : undefined;
    this.endAtIso = input?.endAt ? PlanningWindow.toIsoDate(input.endAt) : undefined;
  }

  public hasAnyBound(): boolean {
    return Boolean(this.startAtIso) || Boolean(this.endAtIso);
  }

  /**
   * Shifts a crop cycle so its year aligns with the planning window.
   * All phenological phases are preserved proportionally.
   * Returns the original cycle unchanged if:
   * - the planning window has no startAt
   * - the cycle already overlaps with the planning window
   */
  public shiftCycleToWindow<T extends ShiftableCycle>(cycle: T): T {
    if (!this.startAtIso) return cycle;
    const pwYear = parseInt(this.startAtIso.substring(0, 4), 10);
    const cycleYear = cycle.startDate.getFullYear();
    if (pwYear === cycleYear) return cycle;
    const cycleEndIso = PlanningWindow.toIsoDate(cycle.endDate);
    const cycleStartIso = PlanningWindow.toIsoDate(cycle.startDate);
    if (this.startAtIso <= cycleEndIso && (!this.endAtIso || this.endAtIso >= cycleStartIso)) {
      return cycle;
    }
    const deltaMs = (pwYear - cycleYear) * 365.25 * 24 * 60 * 60 * 1000;
    const shift = (d: Date): Date => new Date(d.getTime() + deltaMs);
    console.log(
      `[PLANNING-WINDOW] Shifting cycle from ${cycleYear} to ${pwYear} (delta: ${pwYear - cycleYear} years)`,
    );
    return {
      ...cycle,
      startDate: shift(cycle.startDate),
      floweringDate: shift(cycle.floweringDate),
      harvestingDate: shift(cycle.harvestingDate),
      endDate: shift(cycle.endDate),
    };
  }

  public clampDateRange(
    input: {
      readonly startDate: string;
      readonly endDate: string;
      readonly isOutsideProduction: boolean;
      readonly reason: string;
    } | null,
  ): {
    readonly startDate: string;
    readonly endDate: string;
    readonly isOutsideProduction: boolean;
    readonly reason: string;
  } | null {
    if (!input) {
      return null;
    }
    if (!this.hasAnyBound()) {
      return input;
    }
    const clampedStart = this.startAtIso
      ? PlanningWindow.maxIso(input.startDate, this.startAtIso)
      : input.startDate;
    const clampedEnd = this.endAtIso
      ? PlanningWindow.minIso(input.endDate, this.endAtIso)
      : input.endDate;
    if (clampedStart > clampedEnd) {
      return null;
    }
    if (clampedStart === input.startDate && clampedEnd === input.endDate) {
      return input;
    }
    const reasonSuffix = `Planning window applied: ${this.startAtIso || '-'} .. ${this.endAtIso || '-'}`;
    return {
      ...input,
      startDate: clampedStart,
      endDate: clampedEnd,
      reason: input.reason ? `${input.reason}. ${reasonSuffix}` : reasonSuffix,
    };
  }

  public filterSchedule<T extends { readonly date: string }>(
    schedule: {
      readonly applications: ReadonlyArray<T>;
    } | null,
  ): { readonly applications: ReadonlyArray<T> } | null {
    if (!schedule) {
      return null;
    }
    if (!this.hasAnyBound() || schedule.applications.length === 0) {
      return schedule;
    }
    const filtered = schedule.applications.filter((a) => this.isIsoWithinBounds(a.date));
    if (filtered.length === schedule.applications.length) {
      return schedule;
    }
    return { applications: filtered };
  }

  private isIsoWithinBounds(value: string): boolean {
    if (this.startAtIso && value < this.startAtIso) {
      return false;
    }
    if (this.endAtIso && value > this.endAtIso) {
      return false;
    }
    return true;
  }

  private static toIsoDate(value: Date): string {
    return value.toISOString().split('T')[0];
  }

  private static maxIso(a: string, b: string): string {
    return a >= b ? a : b;
  }

  private static minIso(a: string, b: string): string {
    return a <= b ? a : b;
  }
}
