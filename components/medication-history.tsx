import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MedicationChangeEvent, MedicationSnapshot } from '@/lib/storage';
import { AppColors } from '@/lib/design-tokens';

const TYPE_LABELS: Record<MedicationChangeEvent['changeType'], string> = {
  added: '新增用药',
  updated: '调整用药',
  paused: '暂停用药',
  resumed: '恢复用药',
  deleted: '停止并移除',
};

function formatTime(value: string) {
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

function snapshotName(snapshot?: MedicationSnapshot | null) {
  return snapshot?.name?.trim() || '该药物';
}

function describeChange(change: MedicationChangeEvent): string[] {
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
          <Text style={styles.subtitle}>最近更新：{formatTime(changes[0].changedAt)}</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countText}>{changes.length} 次</Text></View>
      </View>

      {visible.map((change, index) => (
        <View key={change.eventId} style={[styles.changeCard, index > 0 && styles.changeCardDivider]}>
          <View style={styles.changeTopRow}>
            <Text style={styles.typeLabel}>{TYPE_LABELS[change.changeType] || '调整用药'}</Text>
            {change.syncPending ? <Text style={styles.pendingText}>⏳ 等待同步</Text> : null}
          </View>
          {describeChange(change).map((detail, detailIndex) => (
            <Text key={`${change.eventId}_${detailIndex}`} style={styles.detailText}>• {detail}</Text>
          ))}
          {change.reason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>调整原因</Text>
              <Text style={styles.reasonText}>{change.reason}</Text>
            </View>
          ) : null}
          <Text style={styles.metaText}>
            {change.changedByName || '主照顾者'} · {formatTime(change.changedAt)}
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
});
