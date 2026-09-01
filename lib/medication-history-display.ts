import type { Medication, MedicationChangeEvent, MedicationSnapshot } from './storage';

function snapshotName(snapshot?: MedicationSnapshot | null) {
  return snapshot?.name?.trim() || '该药物';
}

export function describeMedicationChange(change: MedicationChangeEvent): string[] {
  const previous = change.previousSnapshot;
  const next = change.nextSnapshot;
  if (change.changeType === 'added') {
    return [`开始服用 ${snapshotName(next)}${next?.dosage ? `（${next.dosage}）` : ''}`];
  }
  if (change.changeType === 'deleted') {
    return [`停止并移除 ${snapshotName(previous)}`];
  }
  if (change.changeType === 'paused') return [`暂停 ${snapshotName(previous ?? next)}`];
  if (change.changeType === 'resumed') return [`恢复 ${snapshotName(next ?? previous)}`];

  const details: string[] = [];
  if (previous?.name !== next?.name) details.push(`药物：${snapshotName(previous)} → ${snapshotName(next)}`);
  if ((previous?.dosage ?? '') !== (next?.dosage ?? '')) details.push(`剂量：${previous?.dosage || '未填写'} → ${next?.dosage || '未填写'}`);
  if ((previous?.frequency ?? '') !== (next?.frequency ?? '')) details.push(`频率：${previous?.frequency || '未填写'} → ${next?.frequency || '未填写'}`);
  if ((previous?.times ?? []).join('、') !== (next?.times ?? []).join('、')) {
    details.push(`时间：${previous?.times?.join('、') || '未填写'} → ${next?.times?.join('、') || '未填写'}`);
  }
  if ((previous?.notes ?? '') !== (next?.notes ?? '')) details.push('更新了用药备注');
  if (previous?.active !== next?.active) details.push(next?.active ? '恢复启用' : '暂停使用');
  return details.length > 0 ? details : [`更新了 ${snapshotName(next ?? previous)} 的用药计划`];
}

function getMedicationServerId(medication: Medication): number | null {
  if (medication.serverMedId != null && Number.isFinite(Number(medication.serverMedId))) {
    return Number(medication.serverMedId);
  }
  const cloudId = /^cloud_(\d+)$/.exec(String(medication.id));
  return cloudId ? Number(cloudId[1]) : null;
}

/**
 * Match history to one medication without using its name. Names are editable and
 * two different medicines may share a display name, so only server identity or
 * the medication's own pending event IDs are safe association keys.
 */
export function getChangesForMedication(
  medication: Medication,
  changes: MedicationChangeEvent[],
): MedicationChangeEvent[] {
  const serverId = getMedicationServerId(medication);
  const pendingEventIds = new Set((medication.pendingChanges ?? []).map(change => change.eventId));
  return changes
    .filter(change => (
      (serverId !== null && Number(change.medicationId) === serverId)
      || pendingEventIds.has(change.eventId)
    ))
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
}
