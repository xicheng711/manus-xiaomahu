/**
 * 优化后的主页核心组件
 * 包含：1. 打卡横幅  2. AI卡片  3. 快捷入口
 * 
 * 使用方式：直接复制到你的项目中
 */

import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, 
  Easing, Platform, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SHADOWS, RADIUS, pressAnimation } from '@/lib/animations';

const { width } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════════
// 1️⃣ 优化后的打卡横幅 - 增强动画效果
// ═══════════════════════════════════════════════════════════════
export function EnhancedCheckinBanner({
  morningDone,
  eveningDone,
  todayCheckIn,
  elderNickname,
  caregiverName,
  onPress,
}: {
  morningDone: boolean;
  eveningDone: boolean;
  todayCheckIn: any;
  elderNickname: string;
  caregiverName: string;
  onPress: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  // 装饰波浪动画
  const wave1Scale = useRef(new Animated.Value(1)).current;
  const wave1Rotate = useRef(new Animated.Value(0)).current;
  const wave2Scale = useRef(new Animated.Value(1)).current;
  const wave2Rotate = useRef(new Animated.Value(0)).current;
  
  // 星星闪烁动画
  const starAnimations = useRef(
    Array.from({ length: 6 }, () => ({
      scale: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    // 未完成时的脉冲效果
    if (!morningDone) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { 
            toValue: 1.02, 
            duration: 1200, 
            easing: Easing.inOut(Easing.ease), 
            useNativeDriver: true 
          }),
          Animated.timing(pulseAnim, { 
            toValue: 1, 
            duration: 1200, 
            easing: Easing.inOut(Easing.ease), 
            useNativeDriver: true 
          }),
        ])
      ).start();
      
      // 背景波浪1动画
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(wave1Scale, { 
              toValue: 1.4, 
              duration: 6000, 
              easing: Easing.inOut(Easing.ease), 
              useNativeDriver: true 
            }),
            Animated.timing(wave1Scale, { 
              toValue: 1, 
              duration: 6000, 
              easing: Easing.inOut(Easing.ease), 
              useNativeDriver: true 
            }),
          ]),
          Animated.sequence([
            Animated.timing(wave1Rotate, { 
              toValue: 1, 
              duration: 12000, 
              easing: Easing.linear, 
              useNativeDriver: true 
            }),
          ]),
        ])
      ).start();
      
      // 背景波浪2动画
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(wave2Scale, { 
              toValue: 1.5, 
              duration: 5000, 
              easing: Easing.inOut(Easing.ease), 
              useNativeDriver: true 
            }),
            Animated.timing(wave2Scale, { 
              toValue: 1, 
              duration: 5000, 
              easing: Easing.inOut(Easing.ease), 
              useNativeDriver: true 
            }),
          ]),
          Animated.sequence([
            Animated.timing(wave2Rotate, { 
              toValue: 1, 
              duration: 10000, 
              easing: Easing.linear, 
              useNativeDriver: true 
            }),
          ]),
        ])
      ).start();
      
      // 星星闪烁动画
      starAnimations.forEach((star, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 500),
            Animated.parallel([
              Animated.sequence([
                Animated.timing(star.scale, { 
                  toValue: 1.2, 
                  duration: 400, 
                  useNativeDriver: true 
                }),
                Animated.timing(star.scale, { 
                  toValue: 0, 
                  duration: 400, 
                  useNativeDriver: true 
                }),
              ]),
              Animated.sequence([
                Animated.timing(star.opacity, { 
                  toValue: 1, 
                  duration: 400, 
                  useNativeDriver: true 
                }),
                Animated.timing(star.opacity, { 
                  toValue: 0, 
                  duration: 400, 
                  useNativeDriver: true 
                }),
              ]),
              Animated.timing(star.rotate, { 
                toValue: 1, 
                duration: 800, 
                useNativeDriver: true 
              }),
            ]),
            Animated.delay(2000),
          ])
        ).start();
      });
    }
  }, [morningDone]);

  const wave1Rotation = wave1Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '120deg'],
  });
  
  const wave2Rotation = wave2Rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-120deg'],
  });

  const checkinProgress = (morningDone ? 1 : 0) + (eveningDone ? 1 : 0);

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    pressAnimation(scaleAnim, onPress);
  };

  if (!morningDone) {
    return (
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.88}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <LinearGradient
              colors={['#4ADE80', '#22C55E', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.checkinBanner}
            >
              {/* 背景装饰波浪1 */}
              <Animated.View
                style={[
                  styles.bannerDecor1,
                  {
                    transform: [
                      { scale: wave1Scale },
                      { rotate: wave1Rotation },
                    ],
                  },
                ]}
              />
              
              {/* 背景装饰波浪2 */}
              <Animated.View
                style={[
                  styles.bannerDecor2,
                  {
                    transform: [
                      { scale: wave2Scale },
                      { rotate: wave2Rotation },
                    ],
                  },
                ]}
              />
              
              {/* 星星装饰 */}
              {starAnimations.map((star, i) => {
                const starRotation = star.rotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '180deg'],
                });
                
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.starDecor,
                      {
                        top: `${20 + Math.random() * 60}%`,
                        left: `${10 + Math.random() * 80}%`,
                        opacity: star.opacity,
                        transform: [
                          { scale: star.scale },
                          { rotate: starRotation },
                        ],
                      },
                    ]}
                  >
                    <Ionicons name="sparkles" size={14} color="white" />
                  </Animated.View>
                );
              })}
              
              <View style={styles.checkinLeft}>
                <View style={styles.checkinIconBox}>
                  <Ionicons name="clipboard-outline" size={28} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkinTitle}>开始今日打卡</Text>
                  <Text style={styles.checkinSub}>
                    每天3个问题，记录{elderNickname}的状态 ✨
                  </Text>
                </View>
              </View>
              <View style={styles.chevronCircle}>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
              </View>
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // 已完成状态
  return (
    <TouchableOpacity style={styles.checkinDone} onPress={handlePress} activeOpacity={0.88}>
      <View style={styles.checkinLeft}>
        <View style={styles.checkinIconBoxDone}>
          <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.checkinTitleDone}>今日记录 {checkinProgress}/2 ✅</Text>
          <Text style={styles.checkinSubDone}>
            早间已完成{eveningDone ? ' · 晚间已完成' : ' · 晚间待完成'}
          </Text>
          {todayCheckIn?.sleepHours != null && (
            <View style={styles.careScoreBadge}>
              <Text style={{ fontSize: 11 }}>
                💤 {elderNickname}睡了 {todayCheckIn.sleepHours}h
              </Text>
              {todayCheckIn.caregiverMoodEmoji && (
                <Text style={{ fontSize: 11, marginLeft: 6 }}>
                  {todayCheckIn.caregiverMoodEmoji} {caregiverName}的心情已记录
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      <View style={styles.chevronCircleDone}>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2️⃣ 优化后的 AI 卡片 - 增强视觉效果
// ═══════════════════════════════════════════════════════════════
export function EnhancedAICard({
  morningDone,
  encouragement,
  motivation,
  onPress,
  onCheckinPress,
}: {
  morningDone: boolean;
  encouragement: string;
  motivation: string;
  onPress: () => void;
  onCheckinPress: () => void;
}) {
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const glowAnim1 = useRef(new Animated.Value(1)).current;
  const glowAnim2 = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 图标摇摆动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconScale, { 
          toValue: 1.15, 
          duration: 2000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
        Animated.timing(iconScale, { 
          toValue: 1, 
          duration: 2000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
      ])
    ).start();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconRotate, { 
          toValue: 1, 
          duration: 4000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
      ])
    ).start();
    
    // 背景光晕1
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim1, { 
          toValue: 1.3, 
          duration: 10000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
        Animated.timing(glowAnim1, { 
          toValue: 1, 
          duration: 10000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
      ])
    ).start();
    
    // 背景光晕2
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim2, { 
          toValue: 1.4, 
          duration: 8000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
        Animated.timing(glowAnim2, { 
          toValue: 1, 
          duration: 8000, 
          easing: Easing.inOut(Easing.ease), 
          useNativeDriver: true 
        }),
      ])
    ).start();
  }, []);

  const iconRotation = iconRotate.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '8deg', '0deg', '-8deg', '0deg'],
  });

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (morningDone) {
      pressAnimation(scaleAnim, onPress);
    } else {
      pressAnimation(scaleAnim, onCheckinPress);
    }
  };

  return (
    <TouchableOpacity 
      onPress={handlePress} 
      activeOpacity={morningDone ? 0.88 : 1}
      disabled={!morningDone && !onCheckinPress}
    >
      <Animated.View style={[styles.aiCard, { transform: [{ scale: scaleAnim }] }]}>
        {/* 背景光晕效果 */}
        <Animated.View
          style={[
            styles.aiGlow1,
            {
              transform: [
                { scale: glowAnim1 },
                { rotate: '0deg' },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.aiGlow2,
            {
              transform: [
                { scale: glowAnim2 },
                { rotate: '0deg' },
              ],
            },
          ]}
        />
        
        {/* 装饰图案 */}
        <Text style={styles.aiDecorFigure}>🩺</Text>

        {/* 头部 */}
        <View style={styles.aiHeader}>
          <Animated.View
            style={{
              transform: [
                { scale: iconScale },
                { rotate: iconRotation },
              ],
            }}
          >
            <LinearGradient
              colors={['#A78BFA', '#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiIconBox}
            >
              <Ionicons name="sparkles" size={22} color="#FFFFFF" />
            </LinearGradient>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiLabel}>AI 今日护理预测</Text>
            <Text style={styles.aiSubLabel}>{motivation}</Text>
          </View>
        </View>

        {/* 内容区 */}
        <View style={styles.aiContentBox}>
          {!morningDone ? (
            /* 骨架屏 */
            <View style={styles.aiSkeletonWrap}>
              <View style={styles.aiSkeletonLine} />
              <View style={[styles.aiSkeletonLine, { width: '78%' }]} />
              <View style={[styles.aiSkeletonLine, { width: '90%', marginTop: 8 }]} />
              <View style={[styles.aiSkeletonLine, { width: '65%' }]} />
              
              <View style={styles.aiSkeletonBadgeRow}>
                <View style={styles.aiSkeletonBadge} />
                <View style={[styles.aiSkeletonBadge, { width: 72 }]} />
                <View style={[styles.aiSkeletonBadge, { width: 64 }]} />
              </View>
              
              <View style={styles.aiSkeletonOverlay}>
                <View style={styles.aiSkeletonLockBox}>
                  <Ionicons name="lock-closed" size={20} color="#7C3AED" />
                  <Text style={styles.aiSkeletonLockText}>完成早间打卡后解锁</Text>
                  <Text style={styles.aiSkeletonLockSub}>打卡后即可查看今日护理建议 ✨</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.aiMessage}>{encouragement}</Text>
          )}
        </View>

        {/* 标签 */}
        {morningDone && (
          <View style={styles.aiBadgeRow}>
            {[
              { emoji: '🧠', text: '护理指数' },
              { emoji: '💬', text: '营养建议' },
              { emoji: '☀️', text: '天气组合' },
            ].map((b, i) => (
              <View key={i} style={styles.aiBadge}>
                <Text style={styles.aiBadgeEmoji}>{b.emoji}</Text>
                <Text style={styles.aiBadgeText}>{b.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 底部链接 */}
        {morningDone ? (
          <View style={styles.aiDetailLink}>
            <Text style={styles.aiDetailLinkText}>查看详细建议</Text>
            <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
          </View>
        ) : (
          <View style={styles.aiDetailLink}>
            <Text style={[styles.aiDetailLinkText, { color: '#10B981' }]}>
              开始早间打卡 →
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════
// 3️⃣ 优化后的快捷入口 - 增强交互
// ═══════════════════════════════════════════════════════════════
export function EnhancedQuickActions({
  actions,
  onActionPress,
}: {
  actions: Array<{
    iconName: string;
    label: string;
    decorEmoji: string;
    gradientStart: string;
    gradientEnd: string;
    bgColor: string;
    route: string;
  }>;
  onActionPress: (route: string) => void;
}) {
  return (
    <View style={styles.quickContainer}>
      {/* 标题 */}
      <View style={styles.sectionHeader}>
        <Animated.Text
          style={[
            styles.sectionTitleEmoji,
            {
              transform: [
                {
                  rotate: useShakeAnimation(),
                },
              ],
            },
          ]}
        >
          🚀
        </Animated.Text>
        <Text style={styles.sectionTitle}>快捷入口</Text>
      </View>

      {/* 网格 */}
      <View style={styles.quickGrid}>
        <View style={styles.quickRow}>
          {actions.slice(0, 2).map((item, i) => (
            <QuickActionCard
              key={item.route}
              {...item}
              onPress={() => onActionPress(item.route)}
              delay={50 + i * 80}
            />
          ))}
        </View>
        <View style={styles.quickRow}>
          {actions.slice(2, 4).map((item, i) => (
            <QuickActionCard
              key={item.route}
              {...item}
              onPress={() => onActionPress(item.route)}
              delay={210 + i * 80}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// 单个快捷卡片组件
function QuickActionCard({
  iconName,
  label,
  decorEmoji,
  gradientStart,
  gradientEnd,
  bgColor,
  onPress,
  delay,
}: {
  iconName: string;
  label: string;
  decorEmoji: string;
  gradientStart: string;
  gradientEnd: string;
  bgColor: string;
  onPress: () => void;
  delay: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 淡入动画
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Emoji 旋转动画
    Animated.loop(
      Animated.sequence([
        Animated.timing(emojiRotate, {
          toValue: 1,
          duration: 3000,
          delay: delay + 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const emojiRotation = emojiRotate.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '10deg', '0deg', '-10deg', '0deg'],
  });

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    pressAnimation(scaleAnim, onPress);
  };

  return (
    <Animated.View
      style={[
        styles.quickItem,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.quickCard, { backgroundColor: bgColor }]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        {/* 渐变图标 */}
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickIconBox}
        >
          <MaterialCommunityIcons name={iconName as any} size={30} color="#fff" />
        </LinearGradient>

        {/* 间隔 */}
        <View style={{ flex: 1 }} />

        {/* 标签 */}
        <Text style={styles.quickLabel}>{label}</Text>

        {/* 装饰 Emoji */}
        <Animated.Text
          style={[
            styles.quickDecorEmoji,
            {
              transform: [{ rotate: emojiRotation }],
            },
          ]}
        >
          {decorEmoji}
        </Animated.Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// 摇摆动画 Hook
function useShakeAnimation() {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return shakeAnim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '10deg', '0deg', '-10deg', '0deg'],
  });
}

// ═══════════════════════════════════════════════════════════════
// 样式定义
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  // 打卡横幅
  checkinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  bannerDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bannerDecor2: {
    position: 'absolute',
    bottom: -20,
    left: 60,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  starDecor: {
    position: 'absolute',
  },
  checkinLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  checkinIconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  checkinIconBoxDone: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
  checkinTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  checkinTitleDone: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  checkinSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  checkinSubDone: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  checkinDone: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    ...SHADOWS.sm,
  },
  chevronCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircleDone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  careScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },

  // AI 卡片
  aiCard: {
    marginBottom: 16,
    backgroundColor: '#F3EEFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  aiGlow1: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    transform: [{ translateX: 60 }, { translateY: -60 }],
  },
  aiGlow2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    transform: [{ translateX: -50 }, { translateY: 50 }],
  },
  aiDecorFigure: {
    position: 'absolute',
    top: 8,
    right: 12,
    fontSize: 44,
    opacity: 0.18,
    transform: [{ scaleX: -1 }],
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  aiIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5B21B6',
    letterSpacing: -0.3,
  },
  aiSubLabel: {
    fontSize: 12,
    color: '#7C3AED',
    marginTop: 2,
  },
  aiContentBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  aiMessage: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  aiSkeletonWrap: {
    position: 'relative',
    overflow: 'hidden',
    gap: 8,
    paddingBottom: 4,
  },
  aiSkeletonLine: {
    width: '100%',
    height: 13,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    opacity: 0.7,
  },
  aiSkeletonBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  aiSkeletonBadge: {
    width: 56,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    opacity: 0.6,
  },
  aiSkeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  aiSkeletonLockBox: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  aiSkeletonLockText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B21B6',
  },
  aiSkeletonLockSub: {
    fontSize: 11,
    color: '#7C3AED',
    textAlign: 'center',
  },
  aiBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiBadgeEmoji: {
    fontSize: 12,
  },
  aiBadgeText: {
    fontSize: 12,
    color: '#5B21B6',
    fontWeight: '600',
  },
  aiDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 10,
  },
  aiDetailLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },

  // 快捷入口
  quickContainer: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitleEmoji: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  quickGrid: {
    gap: 0,
    marginTop: 4,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  quickItem: {
    flex: 1,
  },
  quickCard: {
    borderRadius: 24,
    padding: 18,
    height: 180,
    flexDirection: 'column',
    alignItems: 'flex-start',
    ...SHADOWS.sm,
  },
  quickIconBox: {
    width: 66,
    height: 66,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  quickDecorEmoji: {
    fontSize: 28,
    marginTop: 4,
    opacity: 0.7,
  },
});
