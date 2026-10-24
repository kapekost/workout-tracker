import assert from 'node:assert/strict';
import { test } from 'node:test';

import { colors, dayColor, fontFamily, labelSpacing, tint } from './tokens.js';

test('tint mixes toward white', () => {
  assert.equal(tint('#000000', 0), '#000000');
  assert.equal(tint('#000000', 1), '#ffffff');
  assert.equal(tint('#60a5fa', 0.6), '#bfdbfd');
});

test('dayColor falls back to muted for an unknown day', () => {
  assert.equal(dayColor('upper_a'), colors.accent);
  assert.equal(dayColor('custom_day'), colors.muted);
});

test('fontFamily picks the file for the weight and face', () => {
  assert.equal(fontFamily('bold'), 'Inter_700Bold');
  assert.equal(fontFamily('semibold', true), 'JetBrainsMono_600SemiBold');
  assert.equal(fontFamily(), 'Inter_400Regular');
});

test('labelSpacing is 0.08em in pixels', () => {
  assert.equal(labelSpacing(10), 0.8);
});
