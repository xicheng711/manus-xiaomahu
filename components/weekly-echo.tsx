/**
 * WeeklyEcho — 时光回音
 * A postcard-style AI weekly summary card that appears on Sunday evenings.
 * Shows a warm, personalized reflection of the week's care journey.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { trpc } from '@/lib/trpc';
import { getDiaryEntries, getRecentCheckIns, DiaryEntry, DailyCheckIn } from '@/lib/storage';
import { SHADOWS, RADIUS } from '@/lib/animations';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

interface WeeklyEchoProps {
  caregiverName: string;
  elderNickname: string;
  /** Force show even if not Sunday evening (for testing) */
  forceShow?: boolean;
}

function isSundayEvening(): boolean {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() >= 17;
}

function getWeekDateRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon-based week
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysBack);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

export function WeeklyEcho({ caregiverName, elderNickname, forceShow = false }: WeeklyEchoProps) {
  const [visible, setVisible] = useState(false);
  const [echo, setEcho] = useState<{ title: string; echo: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  const weeklyEchoMutation = trpc.ai.weeklyEcho.useMutation();

  // Floating animation for the postcard
  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -4,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 4,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, []);

  // Shimmer loop on the gradient
  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 2,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, []);

  useEffect(() => {
    if (!forceShow && !isSundayEvening()) return;
    setVisible(true);
    // Entrance animation
    Animated.spring(cardAnim, {
      toValue: 1,
      speed: 6,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, [forceShow]);

  const saveAsImage = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('提示', '保存图片功能在手机上可用');
      return;
    }
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请允许访问相册以保存图片');
        setSaving(false);
        return;
      }
      const uri = await (viewShotRef.current as any)?.capture?.();
      if (uri) {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('已保存', '时光回音卡片已保存到相册 💜');
      }
    } catch (e) {
      Alert.alert('保存失败', '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const generateEcho = async () => {
    setLoading(true);
    try {
      const { start, end } = getWeekDateRange();
      const allDiaries: DiaryEntry[] = await getDiaryEntries();
      const weekDiaries = allDiaries
        .filter(d => d.date >= start && d.date <= end)
        .map(d => ({
          date: d.date,
          mood: d.moodLabel || d.moodEmoji || '未知',
          content: d.content || '',
          tags: d.tags,
        }));

      const allCheckins: DailyCheckIn[] = await getRecentCheckIns(7);
      const weekCheckins = allCheckins
        .filter(c => c.date >= start && c.date <= end)
        .map(c => ({
          date: c.date,
          moodScore: c.moodScore,
          moodEmoji: c.moodEmoji,
          sleepHours: c.sleepHours,
          morningNotes: c.morningNotes,
          eveningNotes: c.eveningNotes,
        }));

      const result = await weeklyEchoMutation.mutateAsync({
        caregiverName: caregiverName || '亲爱的照顾者',
        elderNickname: elderNickname || undefined,
        weekDiaries,
        weekCheckins,
      });

      setEcho({ title: result.title, echo: result.echo });
    } catch (e) {
      setEcho({
        title: '这一周，你做得很棒',
        echo: `${caregiverName || '亲爱的你'}，这一周你一直在默默付出，照顾家人是一件需要很大勇气的事。我看到了你的坚持，也感受到了你的爱。今天给自己一点时间休息，你值得被好好对待。`,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!visible || dismissed) return null;

  const cardScale = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const cardOpacity = cardAnim;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: cardOpacity,
          transform: [
            { scale: cardScale },
            { translateY: floatAnim },
          ],
        },
      ]}
    >
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }}>
      <LinearGradient
        colors={['#7C3AED', '#A855F7', '#EC4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Decorative dots */}
        <View style={[styles.decorDot, { top: 12, right: 40, width: 6, height: 6, opacity: 0.4 }]} />
        <View style={[styles.decorDot, { top: 28, right: 20, width: 4, height: 4, opacity: 0.3 }]} />
        <View style={[styles.decorDot, { bottom: 20, left: 30, width: 8, height: 8, opacity: 0.25 }]} />
        <View style={[styles.decorDot, { bottom: 40, left: 16, width: 5, height: 5, opacity: 0.2 }]} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="postage-stamp" size={20} color="#fff" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.label}>时光回音</Text>
            <Text style={styles.sublabel}>本周护理旅程回顾</Text>
          </View>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            style={styles.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Content area */}
        {!echo && !loading && (
          <View style={styles.promptArea}>
            <Text style={styles.promptText}>
              ✨ 这一周辛苦了，让我帮你回顾一下这段护理旅程吧
            </Text>
            <TouchableOpacity style={styles.generateBtn} onPress={generateEcho}>
              <Text style={styles.generateBtnText}>生成时光回音</Text>
              <MaterialCommunityIcons name="star-four-points" size={16} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingArea}>
            <ActivityIndicator color="rgba(255,255,255,0.8)" size="small" />
            <Text style={styles.loadingText}>正在回顾这一周的点滴…</Text>
          </View>
        )}

        {echo && !loading && (
          <View style={styles.echoArea}>
            <Text style={styles.echoTitle}>{echo.title}</Text>
            <View style={styles.echoTextBox}>
              <Text style={styles.echoText}>{echo.echo}</Text>
            </View>
            <View style={styles.echoFooter}>
              <Text style={styles.echoFrom}>— 来自你的护理伙伴 💜</Text>
            </View>
            {/* Save as image button */}
            <TouchableOpacity
              style={styles.saveImageBtn}
              onPress={saveAsImage}
              disabled={saving}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="image-outline" size={16} color="#7C3AED" />
              <Text style={styles.saveImageBtnText}>
                {saving ? '保存中...' : '保存为图片'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
      </ViewShot>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    borderRadius: RADIUS.xxl,
    ...SHADOWS.lg,
  },
  card: {
    borderRadius: RADIUS.xxl,
    padding: 20,
    overflow: 'hidden',
  },
  decorDot: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  sublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptArea: {
    gap: 12,
  },
  promptText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    fontWeight: '500',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  generateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  loadingArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontStyle: 'italic',
  },
  echoArea: {
    gap: 10,
  },
  echoTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  echoTextBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  echoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 22,
    fontWeight: '400',
  },
  echoFooter: {
    alignItems: 'flex-end',
  },
  echoFrom: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    textAlign: 'right',
  },
  saveImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignSelf: 'center',
    marginTop: 10,
  },
  saveImageBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
});