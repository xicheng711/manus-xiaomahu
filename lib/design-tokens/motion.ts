import { Animated, Easing } from 'react-native';

export const Motion = {
  staggerDelay: 100,

  entrance: {
    duration: 400,
    easing: Easing.out(Easing.quad),
    translateY: 12,
  },

  pulse: {
    scaleMin: 1,
    scaleMax: 1.02,
    duration: 1400,
    easing: Easing.inOut(Easing.ease),
  },

  press: {
    scaleDown: 0.98,
    duration: 120,
  },

  heroFade: {
    duration: 400,
    translateY: 8,
  },
};

export function createStaggerEntrance(
  items: number,
  opts?: { delay?: number; duration?: number }
) {
  const delay = opts?.delay ?? Motion.staggerDelay;
  const duration = opts?.duration ?? Motion.entrance.duration;
  const anims = Array.from({ length: items }, () => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(Motion.entrance.translateY),
  }));

  const start = () => {
    Animated.stagger(
      delay,
      anims.map((a) =>
        Animated.parallel([
          Animated.timing(a.opacity, {
            toValue: 1,
            duration,
            easing: Motion.entrance.easing,
            useNativeDriver: true,
          }),
          Animated.timing(a.translateY, {
            toValue: 0,
            duration,
            easing: Motion.entrance.easing,
            useNativeDriver: true,
          }),
        ])
      )
    ).start();
  };

  return { anims, start };
}

export function createPulse(anim: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(anim, {
        toValue: Motion.pulse.scaleMax,
        duration: Motion.pulse.duration,
        easing: Motion.pulse.easing,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: Motion.pulse.scaleMin,
        duration: Motion.pulse.duration,
        easing: Motion.pulse.easing,
        useNativeDriver: true,
      }),
    ])
  );
}

export function createPressAnimation(scaleAnim: Animated.Value, callback: () => void) {
  Animated.sequence([
    Animated.timing(scaleAnim, {
      toValue: Motion.press.scaleDown,
      duration: Motion.press.duration,
      useNativeDriver: true,
    }),
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: Motion.press.duration,
      useNativeDriver: true,
    }),
  ]).start(callback);
}
