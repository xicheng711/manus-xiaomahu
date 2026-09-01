import { describe, expect, it } from 'vitest';
import {
  describeMedicationChange,
  getChangesForMedication,
} from '../lib/medication-history-display';
import type { Medication, MedicationChangeEvent } from '../lib/storage';

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'local-med-1',
    serverMedId: 101,
    name: '多奈哌齐',
    dosage: '10mg',
    frequency: '每天一次',
    times: ['08:00'],
    notes: '',
    icon: '💊',
    active: true,
    ...overrides,
  };
}

function change(overrides: Partial<MedicationChangeEvent> = {}): MedicationChangeEvent {
  return {
    eventId: 'change-1',
    medicationId: 101,
    changeType: 'updated',
    reason: '医生复诊后调整',
    previousSnapshot: {
      name: '多奈哌齐', dosage: '5mg', frequency: '每天一次', times: ['08:00'], notes: '', icon: '💊', active: true,
    },
    nextSnapshot: {
      name: '多奈哌齐', dosage: '10mg', frequency: '每天一次', times: ['08:00'], notes: '', icon: '💊', active: true,
    },
    changedAt: '2026-09-01T12:00:00.000Z',
    changedByName: '阿华',
    ...overrides,
  };
}

describe('per-medication adjustment history', () => {
  it('shows the previous and next dosage for a dose adjustment', () => {
    expect(describeMedicationChange(change())).toContain('剂量：5mg → 10mg');
  });

  it('matches only the same server medication id even when two medicines share a name', () => {
    const sameNameOtherMedication = change({ eventId: 'other', medicationId: 202 });
    const ownChange = change({ eventId: 'own', medicationId: 101 });

    expect(getChangesForMedication(medication(), [sameNameOtherMedication, ownChange]).map(item => item.eventId))
      .toEqual(['own']);
  });

  it('does not treat a null server medication id as numeric zero', () => {
    const med = medication({ id: 'local-only', serverMedId: null as unknown as undefined });
    const impossibleZeroIdChange = change({ eventId: 'zero-id', medicationId: 0 });
    expect(getChangesForMedication(med, [impossibleZeroIdChange])).toEqual([]);
  });

  it('supports cloud-prefixed local medication ids when serverMedId is not yet normalized', () => {
    const med = medication({ id: 'cloud_101', serverMedId: undefined });
    expect(getChangesForMedication(med, [change()])).toHaveLength(1);
  });

  it('shows this medication own pending event before the cloud assigns medicationId', () => {
    const pending = change({ eventId: 'pending-dose', medicationId: null, syncPending: true });
    const med = medication({
      id: 'local-only',
      serverMedId: undefined,
      pendingChanges: [pending],
      syncPending: true,
    });

    expect(getChangesForMedication(med, [pending]).map(item => item.eventId)).toEqual(['pending-dose']);
  });

  it('orders one medicine history newest first', () => {
    const older = change({ eventId: 'older', changedAt: '2026-08-01T12:00:00.000Z' });
    const newer = change({ eventId: 'newer', changedAt: '2026-09-01T12:00:00.000Z' });

    expect(getChangesForMedication(medication(), [older, newer]).map(item => item.eventId))
      .toEqual(['newer', 'older']);
  });
});
