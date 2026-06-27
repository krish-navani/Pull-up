import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { WARM_CORE } from '@/constants/theme';
import { getGreetingContent } from '@/utils/stringUtils';

interface GreetingBannerProps {
  firstName: string;
  style?: any;
}

export default function GreetingBanner({ firstName, style }: GreetingBannerProps) {
  const greeting = getGreetingContent(firstName);
  
  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 150,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.container, 
        style,
        { 
          opacity: fadeAnim, 
          transform: [{ translateY: slideAnim }] 
        }
      ]}
    >
      <Text style={styles.title}>{greeting.title}</Text>
      <Text style={styles.subtitle}>{greeting.subtitle}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: WARM_CORE.text,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: WARM_CORE.textSecondary,
    marginTop: 2,
  },
});
