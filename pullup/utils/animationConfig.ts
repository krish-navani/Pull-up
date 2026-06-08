/**
 * Centralized animation configuration for consistent app-wide animations
 * Inspired by production apps: Uber, Rapido, OLA, Blinkit, Zepto
 */

import { Animated, Easing } from 'react-native';

// ─────────────────────────────────────────────
// Spring physics presets (mass / damping / stiffness)
// ─────────────────────────────────────────────
export const SPRING_PRESETS = {
  /** Gentle pop-back — card press release */
  GENTLE: { mass: 1, damping: 20, stiffness: 180 },
  /** Snappy tap feedback */
  SNAPPY: { mass: 0.7, damping: 14, stiffness: 220 },
  /** Bouncy entry — empty states, success icons */
  BOUNCY: { mass: 0.8, damping: 10, stiffness: 150 },
  /** Modal/sheet slide up */
  MODAL: { mass: 1, damping: 26, stiffness: 200 },
} as const;

export const ANIMATION_TIMINGS = {
  FAST: 150,
  STANDARD: 300,
  MEDIUM: 500,
  SLOW: 800,
  VERY_SLOW: 1200,
};

export const ANIMATION_DELAYS = {
  NONE: 0,
  SHORT: 100,
  MEDIUM: 200,
  LONG: 300,
};

export const EASING_FUNCTIONS = {
  EASE_IN_OUT: Easing.inOut(Easing.cubic),
  EASE_OUT: Easing.out(Easing.cubic),
  EASE_IN: Easing.in(Easing.cubic),
  SPRING: Easing.elastic(1),
  LINEAR: Easing.linear,
  BOUNCE: Easing.bounce,
};

/**
 * Button Press Animation Config
 * Creates a scale animation for button interactions
 */
export const createButtonPressAnimation = (initialValue = 1) => {
  const scale = new Animated.Value(initialValue);

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.95,
        duration: ANIMATION_TIMINGS.FAST,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { scale, animatePress };
};

/**
 * Loader Rotation Animation Config
 * Creates continuous rotation for loading indicators
 */
export const createLoaderAnimation = () => {
  const rotation = new Animated.Value(0);

  const startRotation = () => {
    rotation.setValue(0);
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.VERY_SLOW,
        easing: EASING_FUNCTIONS.LINEAR,
        useNativeDriver: true,
      })
    ).start();
  };

  const rotationInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return { rotation, rotationInterpolate, startRotation };
};

/**
 * Fade Animation Config
 * Creates fade in/out animations
 */
export const createFadeAnimation = (initialValue = 0) => {
  const opacity = new Animated.Value(initialValue);

  const fadeIn = (duration = ANIMATION_TIMINGS.STANDARD) => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const fadeOut = (duration = ANIMATION_TIMINGS.STANDARD) => {
    Animated.timing(opacity, {
      toValue: 0,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  return { opacity, fadeIn, fadeOut };
};

/**
 * Slide Animation Config
 * Creates slide in/out animations
 */
export const createSlideAnimation = (initialValue = 50) => {
  const slideY = new Animated.Value(initialValue);

  const slideIn = (
    targetValue = 0,
    duration = ANIMATION_TIMINGS.STANDARD
  ) => {
    Animated.timing(slideY, {
      toValue: targetValue,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const slideOut = (
    targetValue = 50,
    duration = ANIMATION_TIMINGS.STANDARD
  ) => {
    Animated.timing(slideY, {
      toValue: targetValue,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  return { slideY, slideIn, slideOut };
};

/**
 * Scale Animation Config
 * Creates scale in/out animations
 */
export const createScaleAnimation = (initialValue = 0.8) => {
  const scale = new Animated.Value(initialValue);

  const scaleIn = (
    targetValue = 1,
    duration = ANIMATION_TIMINGS.STANDARD
  ) => {
    Animated.timing(scale, {
      toValue: targetValue,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const scaleOut = (
    targetValue = 0.8,
    duration = ANIMATION_TIMINGS.STANDARD
  ) => {
    Animated.timing(scale, {
      toValue: targetValue,
      duration,
      easing: EASING_FUNCTIONS.EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  return { scale, scaleIn, scaleOut };
};

/**
 * Pulse Animation Config
 * Creates pulsing effect for attention-grabbing elements
 */
export const createPulseAnimation = () => {
  const opacity = new Animated.Value(1);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: ANIMATION_TIMINGS.MEDIUM,
          easing: EASING_FUNCTIONS.EASE_IN_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_TIMINGS.MEDIUM,
          easing: EASING_FUNCTIONS.EASE_IN_OUT,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  return { opacity, startPulse };
};

/**
 * Shake Animation Config
 * Creates shake effect for error states
 */
export const createShakeAnimation = () => {
  const translateX = new Animated.Value(0);

  const shake = () => {
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { translateX, shake };
};

/**
 * Button Color State Animation Config
 * Animates color changes for button states
 */
export const createButtonStateAnimation = () => {
  const scale = new Animated.Value(1);
  const opacity = new Animated.Value(1);

  const animateDisabled = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0.6,
        duration: ANIMATION_TIMINGS.STANDARD,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: ANIMATION_TIMINGS.STANDARD,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateEnabled = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        easing: EASING_FUNCTIONS.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { scale, opacity, animateDisabled, animateEnabled };
};

// ─────────────────────────────────────────────
// Shimmer animation for skeleton loading
// ─────────────────────────────────────────────
/**
 * Creates a looping shimmer sweep for skeleton placeholders.
 * Translate `shimmerValue` from -1 → 1 over the element width.
 */
export const createShimmerAnimation = () => {
  const shimmer = new Animated.Value(-1);

  const startShimmer = () => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  };

  return { shimmer, startShimmer };
};

// ─────────────────────────────────────────────
// Staggered reveal animations for lists
// ─────────────────────────────────────────────
/**
 * Returns an array of {opacity, translateY} Animated.Values
 * that animate in with the given stagger delay between items.
 */
export const createStaggeredAnimations = (count: number, staggerMs = 60) => {
  const items = Array.from({ length: count }, () => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(24),
  }));

  const reveal = () => {
    const animations = items.flatMap((item, i) => [
      Animated.delay(i * staggerMs),
      Animated.parallel([
        Animated.timing(item.opacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(item.translateY, {
          toValue: 0,
          ...SPRING_PRESETS.GENTLE,
          useNativeDriver: true,
        }),
      ]),
    ]);
    Animated.sequence(animations).start();
  };

  const reset = () => {
    items.forEach(item => {
      item.opacity.setValue(0);
      item.translateY.setValue(24);
    });
  };

  return { items, reveal, reset };
};

// ─────────────────────────────────────────────
// Breathing / pulsing CTA animation
// ─────────────────────────────────────────────
/**
 * Subtle looping scale breath on idle CTAs.
 * Keeps scale between 1.0 and 1.016 — barely visible but alive.
 */
export const createBreathingAnimation = () => {
  const breathScale = new Animated.Value(1);

  const startBreathing = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, {
          toValue: 1.016,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathScale, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  return { breathScale, startBreathing };
};

// ─────────────────────────────────────────────
// Spring-based press feedback (Pressable helper)
// ─────────────────────────────────────────────
/**
 * Provides onPressIn / onPressOut handlers + scale Animated.Value
 * for tactile spring press feedback on any element.
 */
export const createSpringPressAnimation = (pressedScale = 0.965) => {
  const pressScale = new Animated.Value(1);

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: pressedScale,
      ...SPRING_PRESETS.SNAPPY,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      ...SPRING_PRESETS.GENTLE,
      useNativeDriver: true,
    }).start();
  };

  return { pressScale, onPressIn, onPressOut };
};

// ─────────────────────────────────────────────
// Ambient float animation
// ─────────────────────────────────────────────
/**
 * Slow vertical oscillation for cards / icons when idle.
 * Offset: 0 → ±floatAmount → 0, looped.
 */
export const createFloatAnimation = (floatAmount = 4, durationMs = 2600) => {
  const floatY = new Animated.Value(0);

  const startFloat = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -floatAmount,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: floatAmount,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  return { floatY, startFloat };
};
