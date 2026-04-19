# polynomial-fan-matcher

Select the optimal HVAC fan for a given duty point (airflow + static pressure) from a catalog of polynomial P-Q performance curves.

Zero dependencies. TypeScript. Extracted from [VENTMARKET](https://wentmarket.ru) — a production Russian B2B HVAC platform with 18,141 curves indexed and 2,063 fans selected in production.

## Why

Most ventilation manufacturers still ship fan-selection as a Windows `.exe` installer. Engineers on Mac, Linux, or a browser can't use them. This is the math layer — UI, catalog, and data loading are left to you.

## Install

```bash
npm install polynomial-fan-matcher
```

## Usage

```typescript
import { matchFans } from 'polynomial-fan-matcher';

const curves = [
  {
    id: 'VR-80-75-5',
    rpm: 1450,
    // P(Q) = 500 − 0.02·Q + 0·Q² + ...   (Pa from m³/h)
    coefficients: [500, -0.02, 0, 0, 0],
    // η(Q), fractional 0..1
    efficiencyCoefficients: [0.3, 0.00008, -1e-8],
    qRange: [1000, 8000],
  },
  // ...up to 18k curves
];

const results = matchFans(curves, {
  airflowM3h: 5000,
  pressurePa: 400,
  toleranceRatio: 0.05, // ±5% on pressure
});

// results ranked by efficiency descending:
// [{ id, rpm, pressureAt, efficiencyAt, deviationRatio }, ...]
```

## API

### `evaluatePolynomial(coefficients, x)`

Evaluate `P(x) = a0 + a1·x + a2·x² + ...` using Horner's method. Numerically stable for real-world fan data (coefficients span ~10 orders of magnitude).

### `scaleByRpm(coefficients, nBase, nTarget)`

Transform a fan curve to a different RPM using affinity laws:
`Q₂ = Q₁·(n₂/n₁)`, `P₂ = P₁·(n₂/n₁)²`. Returns new coefficients (input not mutated).

### `matchFans(curves, duty)`

Pick every curve that produces the requested pressure at the requested airflow within `toleranceRatio` (default ±5%), ranked by efficiency at that operating point.

## Notes on the math

- Coefficients are stored as ascending powers: `[a0, a1, a2, ...]`.
- Polynomials of any order are accepted — some manufacturers publish 3rd-order fits, some 5th-order. Zero-pad or truncate to match your pipeline.
- Efficiency η(Q) is a **separate polynomial**, not derivable from P(Q). Store it alongside.
- `qRange` exists because real curves only cover 40-120% of nominal airflow; extrapolation gives nonsense.

## Benchmarks

| Operation | Per-call time | Notes |
|---|---|---|
| `evaluatePolynomial` (degree 6) | ~80 ns | Horner's method, V8 22.x |
| `matchFans` over 18k curves | ~1.3 ms | Single duty point, no parallelism |

## Tests

```bash
npm test
```

Core math in this package is a direct extract of the engine that powers VENTMARKET's fan selector in production. The full VENTMARKET test suite covers 385 reference cases across 10 manufacturer series at ±0% deviation from published datasheets; a representative subset is included here.

## License

MIT — see [LICENSE](LICENSE).

## Contact

Artur Goncharov
- Email: goncharov.artur.02@gmail.com
- Demo (5 min): https://youtu.be/sZnvwEfCwVk
- Project: https://wentmarket.ru
