// synthetic: true — generator behavior and frozen A18 parameter assertions use synthetic fixtures only.
import { describe, expect, it } from 'vitest';
import scenariosFile from '../../tools/synthetic/scenarios.json';
import { addDays, diffDays, parse } from '../../src/lib/localdate/index.ts';
import { generatePreviewData, generateScenario } from '../../tools/synthetic/generator.ts';

const EXPECTED_LABELS = [
  'DESIGN, informed by Fehring 2006 (95% of cycles 22–36 days) and Bull 2019 (mean 29.3), both population summaries (R3 §1)',
  'DESIGN (models "adaptive periods", Stage C note)',
  'DESIGN',
  'DESIGN, concept from Li 2022 (tracking skips; R3 §1); rates not taken from that paper',
  'DESIGN; FIGO uses >9 days of variation (age 18–25) as "irregular" context (R3 §6)',
  'DESIGN; no retrieved source quantifies this',
] as const;

const START_DATE = parse('2024-01-01');
if (START_DATE === null) throw new Error('Synthetic test date must parse.');

describe('synthetic generator v1', () => {
  it('produces byte-identical preview data for seed 42', () => {
    const first = JSON.stringify(generatePreviewData(42));
    const second = JSON.stringify(generatePreviewData(42));

    expect(first).toBe(second);
  });

  it('keeps all scenario outputs explicitly synthetic and compatible with DayBundle and LocalDate contracts', () => {
    const preview = generatePreviewData(42);

    expect(preview.synthetic).toBe(true);
    expect(preview.generatorVersion).toBe(1);
    expect(preview.scenarios).toHaveLength(7);
    for (const scenario of preview.scenarios) {
      expect(scenario.synthetic).toBe(true);
      expect(scenario.provenance).toContain('Synthetic generator output');
      expect(scenario.dayBundles.length).toBe(scenario.history.observedStarts.length);
      for (const bundle of scenario.dayBundles) {
        expect(parse(bundle.localDate)).toBe(bundle.localDate);
        expect(bundle.flow).toBe('medium');
        expect(bundle.fieldHlc.flow).toEqual({
          wallMs: 0,
          counter: expect.any(Number),
          deviceId: 'synthetic-generator-v1',
        });
      }
      expect(scenario.history.trueStarts).toHaveLength(
        scenario.history.cycleLengthsDays.length + 1,
      );
      for (let index = 0; index < scenario.history.cycleLengthsDays.length; index += 1) {
        const prior = scenario.history.trueStarts[index];
        const next = scenario.history.trueStarts[index + 1];
        const length = scenario.history.cycleLengthsDays[index];
        expect(prior).toBeDefined();
        expect(next).toBeDefined();
        expect(length).toBeDefined();
        expect(diffDays(prior!, next!)).toBe(length);
        expect(addDays(prior!, length!)).toBe(next);
      }
    }
  });

  it('exercises the approved stable, drift, outlier, skipped-log, irregular and post-pill shapes', () => {
    const stable = generateScenario('stable', { seed: 42, startDate: START_DATE });
    const drift = generateScenario('drift', { seed: 42, startDate: START_DATE });
    const outliers = generateScenario('outliers', { seed: 42, startDate: START_DATE });
    const skippedAt10 = generateScenario('skipped-logs', {
      seed: 42,
      startDate: START_DATE,
      skippedLogProbability: 0.1,
    });
    const skippedAt20 = generateScenario('skipped-logs', {
      seed: 42,
      startDate: START_DATE,
      skippedLogProbability: 0.2,
    });
    const irregular = generateScenario('irregular', { seed: 42, startDate: START_DATE });
    const postPill = generateScenario('post-pill', { seed: 42, startDate: START_DATE });

    expect(stable.history.cycleLengthsDays).toHaveLength(12);
    expect(drift.history.cycleLengthsDays).toHaveLength(14);
    expect(drift.profile).toEqual({ meanCycleLengthDays: 28, withinPersonSdDays: 1 });
    expect(drift.history.cyclePhases.slice(0, 8).every((phase) => phase === 'before-step')).toBe(
      true,
    );
    expect(drift.history.cyclePhases.slice(8).every((phase) => phase === 'after-step')).toBe(true);
    expect(outliers.history.cycleLengthsDays).toHaveLength(12);
    expect(skippedAt10.history.cycleLengthsDays).toHaveLength(12);
    expect(skippedAt20.history.cycleLengthsDays).toHaveLength(12);
    expect(skippedAt10.variant).toBe('unlogged-0.1');
    expect(skippedAt20.variant).toBe('unlogged-0.2');
    expect(skippedAt10.history.observedStarts.length).toBeGreaterThanOrEqual(
      skippedAt20.history.observedStarts.length,
    );
    expect(irregular.history.cycleLengthsDays).toHaveLength(12);
    expect(irregular.profile.withinPersonSdDays).toBeGreaterThanOrEqual(5);
    expect(irregular.profile.withinPersonSdDays).toBeLessThan(9);
    expect(postPill.history.cycleLengthsDays).toHaveLength(14);
    expect(postPill.history.cyclePhases.slice(0, 2)).toEqual(['post-pill', 'post-pill']);
  });

  it('freezes the A18 scenario values and source/DESIGN labels', () => {
    expect(scenariosFile.synthetic).toBe(true);
    expect(scenariosFile.generatorVersion).toBe(1);
    expect(scenariosFile.scenarios.map(({ id }) => id)).toEqual([
      'stable',
      'drift',
      'outliers',
      'skipped-logs',
      'irregular',
      'post-pill',
    ]);
    expect(scenariosFile.scenarios.map(({ label }) => label)).toEqual(EXPECTED_LABELS);
    expect(scenariosFile.scenarios.map(({ parameters }) => parameters)).toEqual([
      {
        meanCycleLengthDays: { distribution: 'uniform', min: 24, max: 35 },
        withinPersonSdDays: { distribution: 'choice', values: [1, 2, 3, 4] },
        cycleLengthDays: { distribution: 'gaussian', rounding: 'whole days' },
        cycles: 12,
      },
      {
        cyclesAtInitialMean: 8,
        initialMeanCycleLengthDays: 28,
        stepChangeDays: -4,
        cyclesAfterStep: 6,
        withinPersonSdDays: 1,
      },
      {
        baseProfile: 'stable',
        outlierChancePerCycle: 0.05,
        outlierIncreaseDays: { min: 8, max: 14 },
      },
      {
        baseProfile: 'stable',
        unloggedTrueStartProbability: [0.1, 0.2],
      },
      {
        baseProfile: 'stable',
        withinPersonSdDays: { distribution: 'uniform', min: 5, max: 9 },
      },
      {
        initialCyclesAfterStopping: 2,
        initialMeanIncreaseDays: 5,
        initialWithinPersonSdDays: 5,
        thenProfile: 'stable',
      },
    ]);
  });

  it('requires an explicit skipped-log rate and a valid seed', () => {
    expect(() => generateScenario('skipped-logs', { seed: 42 })).toThrow(
      'requires an explicit probability',
    );
    expect(() => generatePreviewData(-1)).toThrow('unsigned 32-bit integer');
  });
});
