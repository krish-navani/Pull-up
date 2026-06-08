import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WARM_CORE } from '@/constants/theme';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  // Animation drivers
  const scaleValue = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const opacityArcs = useRef(new Animated.Value(1)).current;
  
  const opacityText = useRef(new Animated.Value(0)).current;
  const scaleText = useRef(new Animated.Value(0.85)).current;
  
  const opacitySubtitle = useRef(new Animated.Value(0)).current;
  const translateYSubtitle = useRef(new Animated.Value(12)).current;
  
  const opacitySplash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Arcs entrance: scale & spin
    const arcsEntrance = Animated.parallel([
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1200,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]);

    // 2. Morph: Arcs fade/shrink out, Text logo fades/scales in
    const morphToText = Animated.parallel([
      Animated.timing(opacityArcs, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(scaleValue, {
        toValue: 0.8,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(opacityText, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(scaleText, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
    ]);

    // 3. Subtitle slide & fade in
    const subtitleEntrance = Animated.parallel([
      Animated.timing(opacitySubtitle, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(translateYSubtitle, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    // 4. Final Exit Fade-out
    const finalFadeOut = Animated.timing(opacitySplash, {
      toValue: 0,
      duration: 450,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });

    // Run splash sequence sequentially and open the app automatically on completion
    Animated.sequence([
      arcsEntrance,
      Animated.delay(50),
      morphToText,
      Animated.delay(100),
      subtitleEntrance,
      // Hold layout briefly for premium reading time
      Animated.delay(1000),
      finalFadeOut,
    ]).start(() => {
      onFinish();
    });
  }, []);

  // Interpolate spinValue from 0 to 1 -> 0 to 720 degrees
  const spinAngle = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: opacitySplash }]}>
      <View style={styles.centerContainer}>
        
        {/* PHASE 1: Double-Arc Rotating Spinner */}
        <Animated.View
          style={[
            styles.arcsContainer,
            {
              opacity: opacityArcs,
              transform: [{ scale: scaleValue }, { rotate: spinAngle }],
            },
          ]}
        >
          <View style={styles.arcsInner} />
        </Animated.View>

        {/* PHASE 2: "PullUp!" Branding Text */}
        <Animated.View
          style={[
            styles.textLogoContainer,
            {
              opacity: opacityText,
              transform: [{ scale: scaleText }],
            },
          ]}
        >
          <Text style={styles.textPull}>Pull</Text>
          <Text style={styles.textUp}>Up!</Text>
        </Animated.View>

        {/* PHASE 3: Subtitle */}
        <Animated.View
          style={{
            opacity: opacitySubtitle,
            transform: [{ translateY: translateYSubtitle }],
          }}
        >
          <Text style={styles.subtitle}>FRIENDS. SAME ROUTE. ONE RIDE.</Text>
        </Animated.View>
        
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WARM_CORE.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999, // Render on top of everything
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  arcsContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  arcsInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 13,
    borderColor: 'transparent',
    borderTopColor: WARM_CORE.text, // Branded Dark Brown
    borderBottomColor: WARM_CORE.primary, // Branded Burnt Orange
  },
  textLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  textPull: {
    fontSize: 58,
    fontWeight: '900', // Extra bold matching the logo logotype
    color: WARM_CORE.text,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-layout',
    letterSpacing: -3.5, // Tight spacing matching logo
  },
  textUp: {
    fontSize: 58,
    fontWeight: '900', // Extra bold matching the logo logotype
    color: WARM_CORE.primary,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-Heavy' : 'sans-serif-layout',
    letterSpacing: -3.5, // Tight spacing matching logo
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: WARM_CORE.textSecondary,
    letterSpacing: 2,
    marginTop: 8,
    textAlign: 'center',
  },
});
