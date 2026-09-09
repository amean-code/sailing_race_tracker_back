import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allCheckpointsPassed,
  CHECKPOINT_NOT_PASSED_LABEL,
  COMMITTEE_PASS_LABEL,
  checkpointDisplayLabel,
  deriveResultStatus,
  firstUnpassedIndex,
  formatCheckpointExportCells,
  formatExportStatusLabel,
  formatMissedCheckpointReason,
  getCandidateCheckpointIndexes,
  missedCheckpointIndexes,
} from '../common/checkpoint-progress';

describe('getCandidateCheckpointIndexes', () => {
  it('only tests start until start is passed', () => {
    assert.deepEqual(getCandidateCheckpointIndexes(new Set(), 4), [0]);
  });

  it('tests unpassed marks after start but gates finish until a skip is recorded', () => {
    const passed = new Set([0]);
    assert.deepEqual(getCandidateCheckpointIndexes(passed, 4), [1, 2]);
  });

  it('allows finish once a later mark is passed while an earlier one is missing', () => {
    const passed = new Set([0, 2]);
    assert.deepEqual(getCandidateCheckpointIndexes(passed, 4), [1, 3]);
  });

  it('allows finish when it is the next unpassed mark', () => {
    const passed = new Set([0, 1, 2]);
    assert.deepEqual(getCandidateCheckpointIndexes(passed, 4), [3]);
  });

  it('returns no candidates when the course is complete', () => {
    assert.deepEqual(getCandidateCheckpointIndexes(new Set([0, 1, 2, 3]), 4), []);
  });
});

describe('checkpoint completion helpers', () => {
  it('treats FINISHED as every index present, not merely the last one', () => {
    assert.equal(allCheckpointsPassed(new Set([0, 3]), 4), false);
    assert.equal(allCheckpointsPassed(new Set([0, 1, 2, 3]), 4), true);
    assert.deepEqual(missedCheckpointIndexes(new Set([0, 3]), 4), [1, 2]);
    assert.equal(firstUnpassedIndex(new Set([0, 2]), 4), 1);
  });
});

describe('deriveResultStatus', () => {
  it('marks DNF when start and finish exist but a middle mark is missing', () => {
    assert.equal(
      deriveResultStatus({
        storedStatus: 'APPROVED',
        passedIndexes: [0, 2, 3],
        targetCount: 4,
        raceOver: true,
      }),
      'DNF',
    );
  });

  it('marks FINISHED when every checkpoint is present', () => {
    assert.equal(
      deriveResultStatus({
        storedStatus: 'DNF',
        passedIndexes: [0, 1, 2, 3],
        targetCount: 4,
        raceOver: true,
      }),
      'FINISHED',
    );
  });

  it('marks FINISHED when the committee accepted the race', () => {
    assert.equal(
      deriveResultStatus({
        storedStatus: 'DNF',
        passedIndexes: [0, 3],
        targetCount: 4,
        raceOver: true,
        committeeAccepted: true,
      }),
      'FINISHED',
    );
  });

  it('keeps RACING while the race is live with a skip', () => {
    assert.equal(
      deriveResultStatus({
        storedStatus: 'APPROVED',
        passedIndexes: [0, 2],
        targetCount: 4,
        raceOver: false,
      }),
      'RACING',
    );
  });
});

describe('checkpoint labels and export cells', () => {
  it('uses the custom name when present, otherwise the 1-based number', () => {
    assert.equal(checkpointDisplayLabel({ name: 'Rüzgarüstü', id: 'B1' }, 1), 'Rüzgarüstü');
    assert.equal(checkpointDisplayLabel({ id: 'B1' }, 1), '2');
    assert.equal(
      formatMissedCheckpointReason(['Rüzgarüstü']),
      'Rüzgarüstü checkpointinden geçmediği için DNF',
    );
    assert.equal(
      formatMissedCheckpointReason(['2']),
      '2 numaralı checkpointten geçmediği için DNF',
    );
  });

  it('labels skipped, GPS, and untimed committee passes in export cells', () => {
    const formatters = {
      formatPassTime: () => '09.09.2026 12:00:00',
      formatElapsedClock: () => '00:12:00',
    };
    assert.deepEqual(
      formatCheckpointExportCells(null, null, formatters),
      [CHECKPOINT_NOT_PASSED_LABEL, CHECKPOINT_NOT_PASSED_LABEL, CHECKPOINT_NOT_PASSED_LABEL],
    );
    assert.deepEqual(
      formatCheckpointExportCells(
        { source: 'committee', elapsedSeconds: null, passedAt: new Date() },
        1,
        formatters,
      ),
      [COMMITTEE_PASS_LABEL, COMMITTEE_PASS_LABEL, COMMITTEE_PASS_LABEL],
    );
    assert.deepEqual(
      formatCheckpointExportCells(
        { source: 'gps', elapsedSeconds: 720, passedAt: new Date() },
        2,
        formatters,
      ),
      ['09.09.2026 12:00:00', '00:12:00', '2'],
    );
    assert.equal(
      formatExportStatusLabel({
        status: 'DNF',
        dnfReason: '2 numaralı checkpointten geçmediği için DNF',
      }),
      '2 numaralı checkpointten geçmediği için DNF',
    );
  });
});
