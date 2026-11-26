import { PHASE_LABEL, phasePatterns, type Share } from '../../engine/patterns.ts';
import { useApp } from '../app.tsx';
import { Card } from '../components.tsx';
import { MOOD_LABEL } from '../labels.ts';

function percent(label: string, share: Share) {
  return (
    <li>
      {label}:{' '}
      {share.percent === undefined ? (
        <span class="muted">not enough data yet</span>
      ) : (
        <>
          <strong>{share.percent}%</strong>{' '}
          <span class="muted">of {share.basedOn} logged days</span>
        </>
      )}
    </li>
  );
}

export function Patterns() {
  const { output, days } = useApp();
  const patterns = phasePatterns(output, days);
  return (
    <div class="stack">
      <h1>Patterns</h1>
      <p class="muted">
        What you logged in each part of your cycle. Patterns describe the past — they never mean
        what anyone wants now. Each figure needs at least 5 logged days.
      </p>
      {patterns.map((pattern) => (
        <Card key={pattern.phase} heading={PHASE_LABEL[pattern.phase]}>
          <p class="muted">{pattern.loggedDays} logged days</p>
          <ul class="facts">
            {percent('Desire medium or high', pattern.desire)}
            {percent('Days with sex', pattern.sex)}
            {percent('Sex rated great', pattern.satisfaction)}
            {percent('Sex comfortable or okay', pattern.comfort)}
            {percent('High energy', pattern.energy)}
            <li>
              Average sleep:{' '}
              {pattern.averageSleep === undefined ? (
                <span class="muted">not enough data yet</span>
              ) : (
                <strong>{pattern.averageSleep} h</strong>
              )}
            </li>
            {pattern.topMoods.length > 0 ? (
              <li>Common moods: {pattern.topMoods.map((mood) => MOOD_LABEL[mood]).join(', ')}</li>
            ) : null}
          </ul>
        </Card>
      ))}
    </div>
  );
}
