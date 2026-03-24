import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFamilyContext } from '@/lib/family-context';
import { AppColors } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';

export default function FamilySettingsModal() {
  const insets = useSafeAreaInsets();
  const { familyId } = useLocalSearchParams<{ familyId: string }>();
  const { memberships, activeMembership, isCreator, leaveFamily, deleteFamily } = useFamilyContext();

  const membership = memberships.find(m => m.familyId === familyId) ?? activeMembership;
  const room = membership?.room;
  const myRole = membership?.role === 'creator' ? '主照顾者' : '家庭成员';
  const isOwner = membership?.role === 'creator';

  // Delete flow state
  const [showDeleteStep1, setShowDeleteStep1] = useState(false);
  const [showDeleteStep2, setShowDeleteStep2] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Leave flow state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const familyName = room?.elderName ?? '家庭';
  const inviteCode = room?.roomCode ?? '------';
  const members = room?.members ?? [];

  async function handleDelete() {
    if (!membership) return;
    setDeleting(true);
    try {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteFamily(membership.familyId);
      setShowDeleteStep2(false);
      router.back();
    } finally {
      setDeleting(false);
    }
  }

  async function handleLeave() {
    if (!membership) return;
    setLeaving(true);
    try {
      await leaveFamily(membership.familyId);
      setShowLeaveConfirm(false);
      router.back();
    } finally {
      setLeaving(false);
    }
  }

  if (!room) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg.primary }}>
        <Text style={{ color: AppColors.text.secondary }}>找不到家庭信息</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: AppColors.green.strong, fontWeight: '600' }}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>家庭设置</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Family Info Card */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>家庭信息</Text>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>被照护者</Text>
            <Text style={s.infoValue}>{familyName}</Text>
          </View>
          <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={s.infoLabel}>我的身份</Text>
            <View style={[s.roleBadge, isOwner ? s.roleBadgeCreator : s.roleBadgeJoiner]}>
              <Text style={[s.roleBadgeText, isOwner ? s.roleBadgeTextCreator : s.roleBadgeTextJoiner]}>{myRole}</Text>
            </View>
          </View>
        </View>

        {/* Invite Code (creator only) */}
        {isOwner && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>邀请码</Text>
            <Text style={s.inviteDesc}>将邀请码分享给家人，他们可以加入这个家庭空间</Text>
            <View style={s.codeBox}>
              <Text style={s.codeText}>{inviteCode}</Text>
            </View>
          </View>
        )}

        {/* Member List */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>家庭成员 ({members.length})</Text>
          {members.map((member, idx) => {
            const isMe = member.id === membership?.myMemberId;
            const memberRole = member.isCreator ? '主照顾者' : '家庭成员';
            return (
              <View key={member.id} style={[s.memberRow, idx === members.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.memberEmoji}>{member.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.memberName}>{member.name}{isMe ? ' (我)' : ''}</Text>
                  <Text style={s.memberRole}>{memberRole}</Text>
                </View>
                {member.isCreator && (
                  <View style={[s.roleBadge, s.roleBadgeCreator]}>
                    <Text style={[s.roleBadgeText, s.roleBadgeTextCreator]}>管理员</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Danger Zone */}
        <View style={[s.card, s.dangerCard]}>
          <Text style={s.sectionLabel}>危险操作</Text>
          {isOwner ? (
            <>
              <Text style={s.dangerDesc}>
                删除家庭后，所有照护记录、日报和备注将被永久清除，且无法恢复。
              </Text>
              <TouchableOpacity style={s.dangerBtn} onPress={() => setShowDeleteStep1(true)}>
                <Text style={s.dangerBtnText}>删除这个家庭</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.dangerDesc}>
                退出后，你将无法继续查看这个家庭中的记录和日报，但其他成员和数据不会受到影响。
              </Text>
              <TouchableOpacity style={s.leaveBtn} onPress={() => setShowLeaveConfirm(true)}>
                <Text style={s.leaveBtnText}>退出这个家庭</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Delete Step 1: Warning Dialog */}
      <Modal visible={showDeleteStep1} transparent animationType="fade">
        <View style={s.dialogOverlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>删除这个家庭？</Text>
            <Text style={s.dialogBody}>
              删除后，这个家庭中的所有照护记录、日报、趋势和备注都将被永久清除，且无法恢复。{'\n\n'}
              所有家庭成员也将失去访问权限。
            </Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dialogCancelBtn} onPress={() => setShowDeleteStep1(false)}>
                <Text style={s.dialogCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dialogDangerBtn}
                onPress={() => { setShowDeleteStep1(false); setDeleteConfirmText(''); setTimeout(() => setShowDeleteStep2(true), 200); }}
              >
                <Text style={s.dialogDangerText}>继续删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Step 2: Type family name */}
      <Modal visible={showDeleteStep2} transparent animationType="fade">
        <View style={s.dialogOverlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>最终确认</Text>
            <Text style={s.dialogBody}>
              请输入「{familyName}」以确认删除
            </Text>
            <TextInput
              style={s.confirmInput}
              placeholder={`输入"${familyName}"`}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholderTextColor={AppColors.text.tertiary}
            />
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dialogCancelBtn} onPress={() => setShowDeleteStep2(false)}>
                <Text style={s.dialogCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogFinalDeleteBtn, deleteConfirmText !== familyName && { opacity: 0.4 }]}
                disabled={deleteConfirmText !== familyName || deleting}
                onPress={handleDelete}
              >
                <Text style={s.dialogFinalDeleteText}>{deleting ? '删除中...' : '永久删除'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave Confirm */}
      <Modal visible={showLeaveConfirm} transparent animationType="fade">
        <View style={s.dialogOverlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>退出这个家庭？</Text>
            <Text style={s.dialogBody}>
              退出后，你将无法继续查看这个家庭中的记录和日报，但其他成员和数据不会受到影响。
            </Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dialogCancelBtn} onPress={() => setShowLeaveConfirm(false)}>
                <Text style={s.dialogCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogDangerBtn, { backgroundColor: AppColors.text.secondary }]}
                onPress={handleLeave}
                disabled={leaving}
              >
                <Text style={s.dialogDangerText}>{leaving ? '退出中...' : '确认退出'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { paddingVertical: 6, paddingRight: 16 },
  backText: { fontSize: 17, color: AppColors.green.strong, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  card: {
    backgroundColor: '#FDF9F7', borderRadius: 18, padding: 18, marginBottom: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: AppColors.text.tertiary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: AppColors.border.soft },
  infoLabel: { fontSize: 15, color: AppColors.text.secondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: AppColors.text.primary },

  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleBadgeCreator: { backgroundColor: AppColors.green.soft },
  roleBadgeJoiner: { backgroundColor: AppColors.purple.soft },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  roleBadgeTextCreator: { color: AppColors.green.strong },
  roleBadgeTextJoiner: { color: AppColors.purple.strong },

  inviteDesc: { fontSize: 13, color: AppColors.text.secondary, marginBottom: 12, lineHeight: 18 },
  codeBox: { backgroundColor: AppColors.bg.secondary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft, borderStyle: 'dashed' },
  codeText: { fontSize: 28, fontWeight: '800', color: AppColors.text.primary, letterSpacing: 6 },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: AppColors.border.soft },
  memberEmoji: { fontSize: 22, marginRight: 12 },
  memberName: { fontSize: 15, fontWeight: '600', color: AppColors.text.primary },
  memberRole: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },

  dangerCard: { borderWidth: 1.5, borderColor: '#FECACA' },
  dangerDesc: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20, marginBottom: 14 },
  dangerBtn: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  leaveBtn: { backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  leaveBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.text.secondary },

  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  dialog: { backgroundColor: '#FDF9F7', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 12, textAlign: 'center' },
  dialogBody: { fontSize: 14, color: AppColors.text.secondary, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  dialogBtns: { flexDirection: 'row', gap: 10 },
  dialogCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: AppColors.bg.secondary, alignItems: 'center' },
  dialogCancelText: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary },
  dialogDangerBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#DC2626', alignItems: 'center' },
  dialogDangerText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  confirmInput: {
    borderWidth: 1.5, borderColor: AppColors.border.soft, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: AppColors.text.primary,
    backgroundColor: AppColors.bg.secondary, marginBottom: 16,
  },
  dialogFinalDeleteBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#DC2626', alignItems: 'center' },
  dialogFinalDeleteText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
