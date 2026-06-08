/**
 * CostDisplay – Premium animated cost card
 * Uber/Ola-style with entrance animation and glow accent
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface CostDisplayProps {
  title: string;
  amount: number;
  currency?: string;
  subtext?: string;
  icon?: string;
  highlightColor?: string;
  size?: 'small' | 'medium' | 'large';
  animationDelay?: number;
}

export default function CostDisplay({
  title,
  amount,
  currency = '₹',
  subtext,
  icon,
  highlightColor = '#22C55E',
  size = 'medium',
  animationDelay = 0,
}: CostDisplayProps) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400, delay: animationDelay, useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 350, delay: animationDelay, useNativeDriver: true,
      }),
    ]).start();
  }, [animationDelay]);

  const isNegative = amount < 0;
  const displayAmt = Math.abs(Math.round(amount)).toLocaleString('en-IN');
  const amtColor   = isNegative ? '#EF4444' : highlightColor;

  const fontSize = size === 'large' ? 30 : size === 'small' ? 18 : 22;
  const iconSize = size === 'large' ? 20 : size === 'small' ? 14 : 16;

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        size === 'small' && styles.containerSmall,
        size === 'large' && styles.containerLarge,
      ]}
    >
      {/* Top accent bar */}
      <View style={[styles.accentBar, { backgroundColor: amtColor }]} />

      <View style={styles.header}>
        {icon && (
          <View style={[styles.iconBox, { backgroundColor: amtColor + '22' }]}>
            <MaterialCommunityIcons name={icon as any} size={iconSize} color={amtColor} />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.amountRow}>
        <Text style={[styles.currency, { color: amtColor, fontSize: fontSize * 0.55 }]}>
          {isNegative ? '-' : ''}{currency}
        </Text>
        <Text style={[styles.amount, { color: amtColor, fontSize }]}>{displayAmt}</Text>
      </View>

      {subtext && <Text style={styles.subtext}>{subtext}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#1A1A1A',
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     '#2E2E2E',
    overflow:        'hidden',
    minHeight:       100,
  },
  containerSmall: {
    minHeight: 90,
    padding:   12,
  },
  containerLarge: {
    minHeight: 120,
    padding:   18,
  },
  accentBar: {
    position:    'absolute',
    top:          0,
    left:         0,
    right:        0,
    height:       3,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  10,
    marginTop:     4,
  },
  iconBox: {
    width:         28,
    height:        28,
    borderRadius:  8,
    justifyContent: 'center',
    alignItems:    'center',
  },
  title: {
    fontSize:   12,
    fontWeight: '600',
    color:      '#9CA3AF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    gap:           2,
  },
  currency: {
    fontWeight:  '700',
    marginBottom: 1,
  },
  amount: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize:  10,
    color:     '#6B7280',
    marginTop:  6,
    fontWeight: '500',
  },
});
