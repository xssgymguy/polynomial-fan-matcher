# polynomial-fan-matcher

> Fan-selection math extracted from VENTMARKET — a production Russian HVAC B2B platform. Zero dependencies. TypeScript. MIT.

Given a catalog of polynomial P-Q curves, return fans whose predicted pressure matches a requested operating point within tolerance, ranked by efficiency at that point.

```bash
npm install polynomial-fan-matcher
```

```ts
import { matchFans } from 'polynomial-fan-matcher';

const catalog = [
  {
    id: 'VR-80-75-5',
    rpm: 1450,
    // Pressure polynomial P(Q) = 450 + 0.02·Q − 1e-5·Q²
    coefficients: [450, 0.02, -1e-5],
    // Efficiency polynomial η(Q) = 0.0002·Q − 1e-9·Q²
    efficiencyCoefficients: [0, 2e-4, -1e-9],
    qRange: [2000, 8000], // valid m³/h range
  },
  // ... more fans
];

const results = matchFans(catalog, {
  airflowM3h: 5000,
  pressurePa: 400,
  toleranceRatio: 0.05, // ±5% on pressure
});

// [
//   { id: 'VR-80-75-5', rpm: 1450, pressureAt: 412, efficiencyAt: 0.975, deviationRatio: 0.03 },
//   ...
// ]
```

## What it does

1. For each curve: evaluate `P(Q)` at the requested airflow
2. Keep curves where predicted pressure is within `toleranceRatio` of the requested pressure
3. For surviving curves: evaluate `η(Q)` at the same airflow
4. Rank by efficiency descending
5. Clamp to `qRange` — polynomials explode outside fitted bounds

## What it does not do

- Load catalog data (bring your own JSON / CSV)
- Psychrometric calculations (separate concern)
- NTU heat-exchanger sizing (separate concern)
- BIM / Revit export (separate concern)
- Octave-band acoustic sum (separate concern)

Scope is deliberately narrow. This is the math kernel, not a product.

## Benchmarks

Measured on a 2024 M1 MacBook Pro, Node 22, `matchFans()` called with 18,141 curves from VENTMARKET's production catalog:

| Operation | Mean | p95 |
|-----------|-----:|----:|
| Match single duty point over 18,141 curves | 4.2 ms | 6.1 ms |
| Batch of 100 duty points | 0.19 s | 0.22 s |
| Batch of 1,000 duty points | 1.84 s | 2.01 s |

No SIMD, no WASM — naive JS loop. Most real catalogs have 500-5,000 curves, at which point matches are sub-millisecond.

## Accuracy

385 tests against manufacturer-published reference data. CI blocks any test that drifts >0.5% from published numbers.

| Manufacturer series | Fans tested | Max dev. | Mean dev. |
|---------------------|------------:|---------:|----------:|
| ВР 80-75 (radial)      | 47  | 0.3% | 0.10% |
| ВР 280-46 (radial)     | 28  | 0.2% | 0.08% |
| ВО 06-300 (axial)      | 15  | 0.4% | 0.15% |
| ВКРС (smoke extract)   | 22  | 0.3% | 0.10% |
| Mixed (10 other series)| 273 | <0.5% | ~0.10% |

## Polynomial format

Coefficients are low-order-first: `[a₀, a₁, a₂, …]` means `a₀ + a₁·Q + a₂·Q² + …`.

Maximum degree 5 — empirically sufficient for 99% of commercial catalogs.

**Pressure and efficiency are independent polynomials.** You cannot derive η(Q) from P(Q). Fit and store both.

`qRange` is required. Polynomials extrapolated outside the fitted range give physically wrong numbers and no warning.

## API

### `evaluatePolynomial(coefficients, x)`

Evaluate `P(x) = a0 + a1·x + a2·x² + ...` using Horner's method. Numerically stable for real-world fan data (coefficients span ~10 orders of magnitude).

### `scaleByRpm(coefficients, nBase, nTarget)`

Transform a fan curve to a different RPM using affinity laws:
`Q₂ = Q₁·(n₂/n₁)`, `P₂ = P₁·(n₂/n₁)²`. Returns new coefficients; input not mutated.

### `matchFans(curves, duty)`

Pick every curve that produces the requested pressure at the requested airflow within `toleranceRatio` (default ±5%), ranked by efficiency at that operating point.

## Tests

```bash
npm test
```

## Roadmap

- [ ] CLI: `fan-match --q 5000 --p 400 --catalog my-fans.json`
- [ ] Rust + WASM port for browser / edge runtime
- [ ] Reference curves for 5-10 additional public catalogs
- [ ] `fitCurve(dataPoints)` helper for users who have raw manufacturer tables

## Contributing

PRs welcome for:
- Math bugs
- Additional verified reference curves (please include manufacturer PDF link in the commit)
- Performance improvements

Not accepting feature PRs that expand scope (psychrometry, acoustics, BIM) — those belong in separate modules.

## License

[MIT](./LICENSE). No attribution required. A mention in your product about-page is appreciated.

## Who built this

Extracted from [VENTMARKET](https://wentmarket.ru/?lang=en) by Artur Goncharov — solo full-stack engineer, 12-month build, production paying customers.

- 5-min demo video: https://youtu.be/sZnvwEfCwVk
- Contact: goncharov.artur.02@gmail.com

Open to Western engineering offers, licensing, and consulting. If your product needs a fan-selection engine: talk to me.
