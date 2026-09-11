import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { WARM_CORE } from '@/constants/theme';

interface SplashScreenProps {
  onFinish: () => void;
}

const WORDMARK = require('../assets/pullup-splash-reference.png');

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1200),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(onFinish);
  }, [onFinish, opacity, scale]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.artworkFrame}>
        <Animated.Image
          source={WORDMARK}
          resizeMode="cover"
          style={[styles.artwork, { transform: [{ scale }] }]}
          accessibilityLabel="PullUp! Friends. Same route. One ride."
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WARM_CORE.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  artworkFrame: {
    width: '92%',
    maxWidth: 430,
    aspectRatio: 2.25,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
});
