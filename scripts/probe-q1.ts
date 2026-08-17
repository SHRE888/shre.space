/**
 * Draws the survey repeatedly and reports which Q1 reference sets can appear,
 * so a deleted variant cannot silently survive in the pool.
 */
import { existsSync } from 'node:fs';
import { generateSurveyQuestions, rememberSurveyVariants } from '../constants';

const seen = new Map<string, number>();

for (let i = 0; i < 400; i++) {
  const questions = generateSurveyQuestions();
  rememberSurveyVariants(questions);
  const q1 = questions.find((q) => q.dimension === 'atmosphere');
  if (!q1) throw new Error('no atmosphere question in draw');
  const key = q1.options
    .map((o) => (o.image ?? '').replace('/survey-photos/', ''))
    .sort()
    .join(' | ');
  seen.set(key, (seen.get(key) ?? 0) + 1);
}

console.log(`Distinct Q1 sets across 400 draws: ${seen.size}\n`);
for (const [key, count] of [...seen].sort()) {
  const files = key.split(' | ');
  const missing = files.filter((f) => !existsSync(`public/survey-photos/${f}`));
  const flag = missing.length ? `  <-- MISSING FILE: ${missing.join(', ')}` : '';
  console.log(`  ${String(count).padStart(3)}x  ${key}${flag}`);
}

const banned = [...seen.keys()].filter((k) => /q1v1|q1v2/.test(k));
console.log(
  banned.length
    ? `\nFAIL: deleted variants still in the pool -> ${banned.join(' ; ')}`
    : '\nOK: no deleted variant (q1v1 / q1v2) can be drawn.',
);
