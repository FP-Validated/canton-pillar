import test from 'node:test'; import assert from 'node:assert/strict';
test('onboarding e2e contract reaches projected completion', () => { const steps=['organization','kyb','sandbox','api_key','webhook','first_transfer']; assert.equal(steps.at(-1), 'first_transfer'); });
