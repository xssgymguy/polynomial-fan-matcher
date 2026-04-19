import { describe, it, expect } from 'vitest';
import {
  evaluatePolynomial,
  scaleByRpm,
  matchFans,
  type PerformanceCurve,
} from '../src/index';

describe('evaluatePolynomial', () => {
  it('returns a0 at x=0', () => {
    expect(evaluatePolynomial([450, 0.02, -1e-5], 0)).toBe(450);
  });

  it('matches direct evaluation on a 4th-order polynomial', () => {
    const c = [100, 0.5, -0.001, 1e-7, -1e-11];
    const q = 3000;
    const direct =
      c[0] + c[1] * q + c[2] * q * q + c[3] * q ** 3 + c[4] * q ** 4;
    expect(evaluatePolynomial(c, q)).toBeCloseTo(direct, 6);
  });

  it('returns 0 on non-finite input', () => {
    expect(evaluatePolynomial([1, 2, 3], Infinity)).toBe(0);
    expect(evaluatePolynomial([1, 2, 3], NaN)).toBe(0);
  });

  it('returns 0 on empty coefficients', () => {
    expect(evaluatePolynomial([], 100)).toBe(0);
  });
});

describe('scaleByRpm (affinity laws)', () => {
  it('preserves shape when nTarget === nBase', () => {
    const c = [100, 0.1, -1e-5];
    const scaled = scaleByRpm(c, 1450, 1450);
    expect(scaled).toEqual(c);
  });

  it('doubles pressure when RPM is halved/doubled per affinity', () => {
    // P₂ = P₁ · (n₂/n₁)². At n₂ = 2·n₁, pressure at Q₂ = 2·Q₁ is 4× original.
    const c = [0, 0.2, -1e-6]; // pure Q-dependent curve
    const n1 = 1000;
    const n2 = 2000;
    const q1 = 5000;
    const q2 = q1 * (n2 / n1); // affinity: airflow scales linearly

    const p1 = evaluatePolynomial(c, q1);
    const scaled = scaleByRpm(c, n1, n2);
    const p2 = evaluatePolynomial(scaled, q2);

    expect(p2 / p1).toBeCloseTo((n2 / n1) ** 2, 6);
  });

  it('does not mutate input', () => {
    const c = [100, 0.1];
    const copy = [...c];
    scaleByRpm(c, 1000, 1450);
    expect(c).toEqual(copy);
  });
});

describe('matchFans', () => {
  const catalog: PerformanceCurve[] = [
    {
      id: 'FAN-A',
      rpm: 1450,
      coefficients: [500, -0.02, 0, 0, 0],
      efficiencyCoefficients: [0.3, 0.00008, -1e-8],
      qRange: [1000, 8000],
    },
    {
      id: 'FAN-B',
      rpm: 1450,
      coefficients: [480, 0.01, -5e-6, 0, 0],
      efficiencyCoefficients: [0.5, 0.00004, -6e-9],
      qRange: [2000, 10000],
    },
    {
      id: 'FAN-OUT-OF-RANGE',
      rpm: 2900,
      coefficients: [1000, 0, 0, 0, 0],
      qRange: [8000, 16000],
    },
  ];

  it('returns only fans within tolerance', () => {
    const results = matchFans(catalog, {
      airflowM3h: 5000,
      pressurePa: 400,
      toleranceRatio: 0.1,
    });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('FAN-OUT-OF-RANGE');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('ranks by efficiency descending', () => {
    const results = matchFans(catalog, {
      airflowM3h: 5000,
      pressurePa: 460,
      toleranceRatio: 0.2,
    });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1].efficiencyAt ?? 0;
      const cur = results[i].efficiencyAt ?? 0;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it('respects qRange filtering', () => {
    const results = matchFans(catalog, {
      airflowM3h: 500,
      pressurePa: 400,
    });
    expect(results.every((r) => r.id !== 'FAN-OUT-OF-RANGE')).toBe(true);
  });

  it('returns empty array when no fan matches', () => {
    const results = matchFans(catalog, {
      airflowM3h: 5000,
      pressurePa: 10_000,
      toleranceRatio: 0.05,
    });
    expect(results).toEqual([]);
  });

  it('handles empty catalog', () => {
    expect(matchFans([], { airflowM3h: 1000, pressurePa: 100 })).toEqual([]);
  });
});
