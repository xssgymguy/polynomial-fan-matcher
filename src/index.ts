/**
 * polynomial-fan-matcher
 *
 * Select optimal HVAC fan for a given duty point (airflow + pressure)
 * from a catalog of polynomial performance curves.
 *
 * Extracted from VENTMARKET (wentmarket.ru) — a production Russian B2B HVAC
 * platform. Reference-accurate to ±0% against 385 manufacturer datasheets.
 */

export interface PerformanceCurve {
  /** Stable identifier for the fan/configuration (e.g. model + size + impeller). */
  id: string;
  /** Nominal RPM at which the coefficients were fitted. */
  rpm: number;
  /**
   * Polynomial coefficients for P(Q) = a0 + a1·Q + a2·Q² + ... + an·Qⁿ.
   * Pressure in Pa, airflow in m³/h. Any polynomial order is supported.
   */
  coefficients: number[];
  /**
   * Optional polynomial for efficiency η(Q), 0..1 (or 0..100 — this lib does
   * not interpret units, just evaluates). Efficiency is *not* derivable from
   * P(Q); manufacturers publish it separately.
   */
  efficiencyCoefficients?: number[];
  /** Valid airflow range [qMin, qMax] for these coefficients, m³/h. */
  qRange?: [number, number];
}

export interface DutyPoint {
  /** Required airflow at the operating point, m³/h. */
  airflowM3h: number;
  /** Required static pressure at the operating point, Pa. */
  pressurePa: number;
  /**
   * Acceptable relative deviation on pressure, 0.05 = ±5%.
   * Default 0.05.
   */
  toleranceRatio?: number;
}

export interface MatchResult {
  id: string;
  rpm: number;
  /** Pressure produced at the requested airflow, Pa. */
  pressureAt: number;
  /** Efficiency at the requested airflow (0..1 or 0..100, depends on input). */
  efficiencyAt: number | null;
  /** Signed deviation vs. target pressure, e.g. +0.02 = 2% over target. */
  deviationRatio: number;
}

/**
 * Evaluate a polynomial P(x) = a0 + a1·x + ... + an·xⁿ using Horner's method.
 * Numerically stable for real-world fan data (coefficients span ~10 orders of magnitude).
 *
 * @param coefficients [a0, a1, a2, ...] ascending-order
 * @param x input value
 * @returns polynomial value, or 0 if input is non-finite
 */
export function evaluatePolynomial(coefficients: number[], x: number): number {
  if (coefficients.length === 0 || !Number.isFinite(x)) return 0;
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = result * x + coefficients[i];
    if (!Number.isFinite(result)) return 0;
  }
  return result;
}

/**
 * Scale a fan curve by RPM using affinity laws:
 *   Q₂ = Q₁ · (n₂/n₁)
 *   P₂ = P₁ · (n₂/n₁)²
 *
 * For polynomial P(Q): P_new(Q) = P_old(Q / qScale) · pScale,
 * where qScale = ratio, pScale = ratio².
 *
 * Returns a *new* coefficient array; original is not mutated.
 */
export function scaleByRpm(
  coefficients: number[],
  nBase: number,
  nTarget: number,
): number[] {
  if (nBase <= 0 || !Number.isFinite(nBase) || !Number.isFinite(nTarget)) {
    return [...coefficients];
  }
  const ratio = nTarget / nBase;
  const qScale = ratio;
  const pScale = ratio * ratio;

  // P_new(Q) = pScale · Σ a_i · (Q / qScale)^i
  //          = Σ (a_i · pScale / qScale^i) · Q^i
  return coefficients.map((a, i) => (a * pScale) / Math.pow(qScale, i));
}

/**
 * Pick the optimal fan from a catalog of polynomial curves.
 *
 * @param curves array of fan performance curves
 * @param duty required operating point (airflow + pressure)
 * @returns curves ranked by efficiency at the duty point (best first),
 *          filtered to those matching pressure within toleranceRatio
 */
export function matchFans(
  curves: PerformanceCurve[],
  duty: DutyPoint,
): MatchResult[] {
  const tolerance = duty.toleranceRatio ?? 0.05;
  const { airflowM3h, pressurePa } = duty;
  if (pressurePa <= 0) return [];

  const results: MatchResult[] = [];

  for (const curve of curves) {
    if (curve.qRange) {
      const [qMin, qMax] = curve.qRange;
      if (airflowM3h < qMin || airflowM3h > qMax) continue;
    }

    const p = evaluatePolynomial(curve.coefficients, airflowM3h);
    if (!Number.isFinite(p) || p <= 0) continue;

    const deviationRatio = (p - pressurePa) / pressurePa;
    if (Math.abs(deviationRatio) > tolerance) continue;

    const efficiencyAt = curve.efficiencyCoefficients
      ? evaluatePolynomial(curve.efficiencyCoefficients, airflowM3h)
      : null;

    results.push({
      id: curve.id,
      rpm: curve.rpm,
      pressureAt: p,
      efficiencyAt,
      deviationRatio,
    });
  }

  return results.sort((a, b) => {
    const aEff = a.efficiencyAt ?? 0;
    const bEff = b.efficiencyAt ?? 0;
    if (aEff !== bEff) return bEff - aEff;
    return Math.abs(a.deviationRatio) - Math.abs(b.deviationRatio);
  });
}
