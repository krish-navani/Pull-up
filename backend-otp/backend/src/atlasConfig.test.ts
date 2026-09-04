import assert from 'node:assert/strict';
import { ATLAS_LOCATION, isAtlasEndpoint } from './atlasConfig.js';

assert.equal(isAtlasEndpoint(ATLAS_LOCATION), true);
assert.equal(isAtlasEndpoint({ latitude: 19.0653, longitude: 72.8794 }), false, 'Kurla station must remain a distinct route endpoint');
assert.equal(isAtlasEndpoint({ latitude: 19.07095, longitude: 72.87595 }), true, 'Atlas campus coordinates should canonicalize');
console.log('atlasConfig tests passed');
