import { describe, expect, it } from 'vitest';
import { AgentContextLedger, fingerprintWorkspace } from './AgentContextLedger';

describe('AgentContextLedger', () => {
  it('keeps a bounded handoff without storing source contents', () => {
    const ledger = new AgentContextLedger('session-1', 'model', { maxChars: 160, maxEntries: 4 });
    const files = { 'src/App.jsx': 'secret source'.repeat(100), 'package.json': '{}' };
    ledger.begin('create an app', files);
    ledger.record('Validation passed.');
    ledger.record('A very long model observation '.repeat(30));

    const handoff = ledger.handoff();
    expect(handoff.summary.length).toBeLessThanOrEqual(160);
    expect(handoff.summary).not.toContain('secret source');
    expect(handoff.fileFingerprints['src/App.jsx']).toMatch(/^fnv1a-/);
  });

  it('rehydrates with a compact request and relevant current files', () => {
    const ledger = new AgentContextLedger('session-1', 'model');
    const files = { 'src/App.jsx': 'export default function App() {}' };
    ledger.begin('fix the app', files);
    ledger.record('Previous validation passed.');
    const messages = ledger.rehydrate(ledger.handoff(), files);

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('Compact context rehydration');
    expect(messages[0].content).toContain('src/App.jsx');
    expect(messages[0].content).toContain('Previous validation passed.');
  });

  it('fingerprints paths and contents deterministically', () => {
    expect(fingerprintWorkspace({ 'b.js': '2', 'a.js': '1' })).toBe(
      fingerprintWorkspace({ 'a.js': '1', 'b.js': '2' }),
    );
    expect(fingerprintWorkspace({ 'a.js': '1' })).not.toBe(fingerprintWorkspace({ 'a.js': '2' }));
  });
});
