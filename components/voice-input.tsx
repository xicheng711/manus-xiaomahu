import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { AppColors } from '@/lib/design-tokens';

interface VoiceInputProps {
  onResult: (text: string) => void;
  language?: string;
}

let _speechModule: any = null;
let _addListener: any = null;
let _nativeChecked = false;
let _nativeAvailable = false;

function checkNativeAvailability(): boolean {
  if (_nativeChecked) return _nativeAvailable;
  _nativeChecked = true;
  try {
    const mod = require('expo-speech-recognition');
    if (mod?.ExpoSpeechRecognitionModule) {
      _speechModule = mod.ExpoSpeechRecognitionModule;
      _addListener = mod.addSpeechRecognitionListener;
      _nativeAvailable = true;
    }
  } catch {
    _nativeAvailable = false;
  }
  return _nativeAvailable;
}

const WAVE_BAR_COUNT = 7;
const WAVE_HEIGHTS = [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.3];

function AudioWaveform({ active }: { active: boolean }) {
  const bars = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;
  const animations = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (active) {
      animations.current = bars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 80),
            Animated.timing(bar, {
              toValue: WAVE_HEIGHTS[i],
              duration: 300 + Math.random() * 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.2,
              duration: 300 + Math.random() * 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        )
      );
      animations.current.forEach(a => a.start());
    } else {
      animations.current.forEach(a => a.stop());
      bars.forEach(bar =>
        Animated.timing(bar, { toValue: 0.3, duration: 200, useNativeDriver: true }).start()
      );
    }
    return () => {
      animations.current.forEach(a => a.stop());
    };
  }, [active]);

  return (
    <View style={waveStyles.container}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            {
              transform: [{ scaleY: bar }],
              backgroundColor: active ? '#DC2626' : AppColors.green.primary,
            },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 24,
    justifyContent: 'center',
  },
  bar: {
    width: 3,
    height: 22,
    borderRadius: 1.5,
  },
});

export function VoiceInput({ onResult, language = 'zh-CN' }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const recognitionRef = useRef<any>(null);
  const accumulatedText = useRef('');
  const listenersRef = useRef<Array<() => void>>([]);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string) {
    setErrorMsg(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setErrorMsg(''), 3500);
  }

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();

    Animated.timing(glowAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }

  const registerNativeListeners = useCallback(() => {
    if (!_addListener || listenersRef.current.length > 0) return;
    try {
      const unsub1 = _addListener('result', (event: any) => {
        const results = event.results;
        if (results && results.length > 0) {
          const text = results[results.length - 1]?.[0]?.transcript ?? '';
          if (text) accumulatedText.current = text;
        }
      })?.remove;

      const unsub2 = _addListener('end', () => {
        setIsListening(false);
        stopPulse();
        if (accumulatedText.current) {
          onResult(accumulatedText.current);
          accumulatedText.current = '';
        }
      })?.remove;

      const unsub3 = _addListener('error', () => {
        setIsListening(false);
        stopPulse();
      })?.remove;

      if (unsub1) listenersRef.current.push(unsub1);
      if (unsub2) listenersRef.current.push(unsub2);
      if (unsub3) listenersRef.current.push(unsub3);
    } catch {}
  }, [onResult]);

  useEffect(() => {
    return () => {
      listenersRef.current.forEach(fn => { try { fn(); } catch {} });
      listenersRef.current = [];
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  const handlePress = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    }

    if (isListening) {
      if (_speechModule) {
        try { _speechModule.stop?.(); } catch {}
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      stopPulse();
      if (accumulatedText.current) {
        onResult(accumulatedText.current);
        accumulatedText.current = '';
      }
      return;
    }

    if (checkNativeAvailability() && _speechModule) {
      try {
        const perm = await _speechModule.requestPermissionsAsync();
        if (!perm.granted) {
          showError('请在系统设置中允许麦克风和语音识别权限');
          return;
        }
        // 同时请求语音识别权限
        try {
          const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
          if (ExpoSpeechRecognitionModule?.requestPermissionsAsync) {
            await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          }
        } catch {}
        accumulatedText.current = '';
        registerNativeListeners();
        _speechModule.start({ lang: language, interimResults: true, continuous: false });
        setIsListening(true);
        startPulse();
        return;
      } catch (e) {
        console.warn('Native speech recognition failed:', e);
      }
    }

    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.lang = language;
          recognition.interimResults = false;
          recognition.continuous = false;
          recognitionRef.current = recognition;
          accumulatedText.current = '';

          recognition.onresult = (event: any) => {
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              if (event.results[i].isFinal) {
                text += event.results[i][0].transcript;
              }
            }
            if (text) accumulatedText.current = text;
          };
          recognition.onend = () => {
            setIsListening(false);
            stopPulse();
            if (accumulatedText.current) {
              onResult(accumulatedText.current);
              accumulatedText.current = '';
            }
            recognitionRef.current = null;
          };
          recognition.onerror = (e: any) => {
            setIsListening(false);
            stopPulse();
            recognitionRef.current = null;
            if (e.error === 'not-allowed') {
              showError('请在浏览器中允许麦克风权限');
            } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
              showError('语音识别出错，请重试');
            }
          };

          recognition.start();
          setIsListening(true);
          startPulse();
          return;
        } catch {
          showError('无法启动语音识别，请直接输入文字');
        }
        return;
      }
    }

    showError('当前环境不支持语音输入，请直接打字');
  }, [isListening, language, onResult, registerNativeListeners]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });

  return (
    <View style={styles.container}>
      <View style={styles.btnRow}>
        <Animated.View style={[styles.glowRing, { opacity: glowOpacity, transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={handlePress}
            activeOpacity={0.7}
          >
            <Text style={styles.micIcon}>{isListening ? '🔴' : '🎙️'}</Text>
          </TouchableOpacity>
        </Animated.View>
        {isListening && <AudioWaveform active={isListening} />}
        <Text style={[styles.micLabel, isListening && styles.micLabelActive]}>
          {isListening ? '聆听中…' : '语音'}
        </Text>
      </View>
      {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  glowRing: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FCA5A5',
  },
  micBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    backgroundColor: '#F0F7EE',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#D4E8D4',
  },
  micBtnActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  micIcon: { fontSize: 18 },
  micLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3D7A3D',
  },
  micLabelActive: { color: '#DC2626' },
  errorMsg: {
    fontSize: 11,
    color: '#DC2626',
    textAlign: 'center',
    maxWidth: 180,
    marginTop: 4,
  },
});
