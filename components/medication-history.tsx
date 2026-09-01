import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Medication, MedicationChangeEvent } from '@/lib/storage';
import { AppColors } from '@/lib/design-tokens';
import { describeMedicationChange, getChangesForMedication } from '@/lib/medication-history-display';

const TYPE_LABELS: Record<MedicationChangeEvent['changeType'], string> = {
  added: '新增用药',
  updated: '调整用药',
  paused: '暂停用药',
  resumed: '恢复用药',
  deleted: '停止并移除',
};

export function formatMedicationChangeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function MedicationItemHistory({
  medication,
  changes,
}: {
  medication: Medication;
  changes: MedicationChangeEvent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const medicationChanges = useMemo(
    () => getChangesForMedication(medication, changes),
    [medication, changes],
  );
  const visibleChanges = expanded ? medicationChanges : medicationChanges.slice(0, 1);

  if (medicationChanges.length === 0) return null;

  return (
    <View style={styles.itemHistorySection}>
      <View style={styles.itemHistoryHeader}>
        <Text style={styles.itemHistoryTitle}>最近调整</Text>
        <Text style={styles.itemHistoryDate}>{formatMedicationChangeTime(medicationChanges[0].changedAt)}</Text>
      </View>

      {visibleChanges.map((change, index) => (
        <View key={change.eventId} style={[styles.itemHistoryEntry, index > 0 && styles.itemHistoryEntryDivider]}>
          <View style={styles.itemHistoryTypeRow}>
            <Text style={styles.itemHistoryType}>{TYPE_LABELS[change.changeType] || '调整用药'}</Text>
            {change.syncPending ? <Text style={styles.pendingText}>⏳ 等待同步</Text> : null}
          </View>
          {describeMedicationChange(change).map((detail, detailIndex) => (
            <Text key={`${change.eventId}_item_${detailIndex}`} style={styles.itemHistoryDetail}>{detail}</Text>
          ))}
          {change.reason ? (
            <Text style={styles.itemHistoryReason}>
              <Text style={styles.itemHistoryReasonLabel}>原因：</Text>{change.reason}
            </Text>
          ) : null}
          <Text style={styles.itemHistoryMeta}>
            {change.changedByName || '主照顾者'} · {formatMedicationChangeTime(change.changedAt)}
          </Text>
        </View>
      ))}

      {medicationChanges.length > 1 ? (
        <TouchableOpacity
          style={styles.itemHistoryExpandButton}
          onPress={() => setExpanded(value => !value)}
          activeOpacity={0.75}
        >
          <Text style={styles.itemHistoryExpandText}>
            {expanded ? '收起这款药的记录 ↑' : `查看这款药的全部 ${medicationChanges.length} 次调整 ↓`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MedicationHistory({ changes }: { changes: MedicationChangeEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(() => expanded ? changes : changes.slice(0, 1), [changes, expanded]);

  if (changes.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>🕰️ 用药调整记录</Text>
        <Text style={styles.emptyText}>以后修改剂量、药物或服药时间时，会在这里保留原因和记录。</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🕰️ 用药调整记录</Text>
          <Text style={styles.subtitle}>最近更新：{formatMedicationChangeTime(changes[0].changedAt)}</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countText}>{changes.length} 次</Text></View>
      </View>

      {visible.map((change, index) => (
        <View key={change.eventId} style={[styles.changeCard, index > 0 && styles.changeCardDivider]}>
          <View style={styles.changeTopRow}>
            <Text style={styles.typeLabel}>{TYPE_LABELS[change.changeType] || '调整用药'}</Text>
            {change.syncPending ? <Text style={styles.pendingText}>⏳ 等待同步</Text> : null}
          </View>
          {describeMedicationChange(change).map((detail, detailIndex) => (
            <Text key={`${change.eventId}_${detailIndex}`} style={styles.detailText}>• {detail}</Text>
          ))}
          {change.reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>调整原因</Text>
              <Text style={styles.reasonText}>{change.reason}</Text>
            </View>
          ) : null}
          <Text style={styles.metaText}>
            {change.changedByName || '主照顾者'} · {formatMedicationChangeTime(change.changedAt)}
          </Text>
        </View>
      ))}

      {changes.length > 1 ? (
        <TouchableOpacity style={styles.expandButton} onPress={() => setExpanded(value => !value)} activeOpacity={0.75}>
          <Text style={styles.expandText}>{expanded ? '收起调整记录 ↑' : `查看全部 ${changes.length} 次调整 ↓`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: '#EADFD9',
  },
  emptyCard: {
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: '#EEE3DE',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary, marginBottom: 6 },
  emptyText: { fontSize: 12, lineHeight: 19, color: AppColors.text.secondary },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', color: AppColors.text.primary },
  subtitle: { marginTop: 4, fontSize: 11, color: AppColors.text.tertiary },
  countBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F7ECE8' },
  countText: { fontSize: 11, fontWeight: '700', color: '#9B6A58' },
  changeCard: { paddingTop: 8 },
  changeCardDivider: { marginTop: 14, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9DFDB' },
  changeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeLabel: { fontSize: 14, fontWeight: '800', color: '#6E5147' },
  pendingText: { fontSize: 10, color: '#B7791F' },
  detailText: { fontSize: 13, lineHeight: 20, color: AppColors.text.secondary },
  reasonBox: { marginTop: 9, padding: 11, borderRadius: 12, backgroundColor: '#F8F3F0' },
  reasonLabel: { fontSize: 10, fontWeight: '800', color: '#A06F60', marginBottom: 4 },
  reasonText: { fontSize: 13, lineHeight: 20, color: AppColors.text.primary },
  metaText: { marginTop: 9, fontSize: 11, color: AppColors.text.tertiary },
  expandButton: { marginTop: 14, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: '#FAF3F0' },
  expandText: { fontSize: 12, fontWeight: '700', color: '#9B6A58' },
  itemHistorySection: {
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8DEDA',
  },
  itemHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  itemHistoryTitle: { fontSize: 12, fontWeight: '800', color: '#8C6558' },
  itemHistoryDate: { flexShrink: 1, textAlign: 'right', fontSize: 10, color: AppColors.text.tertiary },
  itemHistoryEntry: { paddingVertical: 2 },
  itemHistoryEntryDivider: {
    marginTop: 11,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8DEDA',
  },
  itemHistoryTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  itemHistoryType: { fontSize: 12, fontWeight: '800', color: AppColors.text.primary },
  itemHistoryDetail: { fontSize: 12, lineHeight: 18, color: AppColors.text.secondary },
  itemHistoryReason: {
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8F3F0',
    fontSize: 12,
    lineHeight: 18,
    color: AppColors.text.primary,
  },
  itemHistoryReasonLabel: { fontWeight: '800', color: '#95695C' },
  itemHistoryMeta: { marginTop: 6, fontSize: 10, color: AppColors.text.tertiary },
  itemHistoryExpandButton: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#FAF3F0',
  },
  itemHistoryExpandText: { fontSize: 11, fontWeight: '700', color: '#95695C' },
});
