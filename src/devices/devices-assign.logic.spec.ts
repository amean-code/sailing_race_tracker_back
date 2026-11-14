import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure helpers mirroring DevicesService assign concurrency rules.
 * Full DB integration is covered by manual/local test env.
 */

type Snapshot = {
  deviceId: string;
  assignedBoatId: string | null;
};

type Assignment = {
  deviceId: string;
  boatId: string;
  status: 'ACTIVE' | 'RELEASED' | 'REPLACED';
};

function applyAssign(
  devices: Snapshot[],
  assignments: Assignment[],
  deviceId: string,
  boatId: string,
): { devices: Snapshot[]; assignments: Assignment[] } {
  const nextDevices = devices.map((d) => ({ ...d }));
  const nextAssignments = assignments.map((a) => ({ ...a }));

  for (const a of nextAssignments) {
    if (a.status !== 'ACTIVE') continue;
    if (a.deviceId === deviceId || a.boatId === boatId) {
      a.status = 'REPLACED';
      const other = nextDevices.find((d) => d.deviceId === a.deviceId);
      if (other && other.assignedBoatId === a.boatId) other.assignedBoatId = null;
    }
  }

  const device = nextDevices.find((d) => d.deviceId === deviceId);
  assert.ok(device, 'device must exist');
  device.assignedBoatId = boatId;
  nextAssignments.push({ deviceId, boatId, status: 'ACTIVE' });

  return { devices: nextDevices, assignments: nextAssignments };
}

function activeCount(assignments: Assignment[], pred: (a: Assignment) => boolean) {
  return assignments.filter((a) => a.status === 'ACTIVE' && pred(a)).length;
}

describe('device assign concurrency rules', () => {
  it('keeps at most one ACTIVE assignment per device', () => {
    const devices = [
      { deviceId: 'd1', assignedBoatId: 'b1' },
      { deviceId: 'd2', assignedBoatId: null },
    ];
    const assignments: Assignment[] = [
      { deviceId: 'd1', boatId: 'b1', status: 'ACTIVE' },
    ];

    const result = applyAssign(devices, assignments, 'd1', 'b2');
    assert.equal(activeCount(result.assignments, (a) => a.deviceId === 'd1'), 1);
    assert.equal(result.devices.find((d) => d.deviceId === 'd1')?.assignedBoatId, 'b2');
  });

  it('keeps at most one ACTIVE device per boat', () => {
    const devices = [
      { deviceId: 'd1', assignedBoatId: 'b1' },
      { deviceId: 'd2', assignedBoatId: null },
    ];
    const assignments: Assignment[] = [
      { deviceId: 'd1', boatId: 'b1', status: 'ACTIVE' },
    ];

    const result = applyAssign(devices, assignments, 'd2', 'b1');
    assert.equal(activeCount(result.assignments, (a) => a.boatId === 'b1'), 1);
    assert.equal(result.devices.find((d) => d.deviceId === 'd1')?.assignedBoatId, null);
    assert.equal(result.devices.find((d) => d.deviceId === 'd2')?.assignedBoatId, 'b1');
  });
});
