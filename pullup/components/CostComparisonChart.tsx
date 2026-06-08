/**
 * CostComparisonChart – Animated horizontal bar chart
 * Smooth grow-in bars comparing Solo vs Carpool costs
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface CostData {
  label: string;
  solo: number;
  carpool: number;
  savings: number;
}

interface CostComparisonChartProps {
  data: CostData[];
}

const SOLO_COLOR    = '#EF4444';
const CARPOOL_COLOR = '#22C55E';
const SAVINGS_COLOR = '#10B981';

function AnimatedBar({
  value,
  maxValue,
  color,
  delay,
}: {
  value: number;
  maxValue: number;
  color: string;
  delay: number;
}) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue:         pct,
      duration:        600,
      delay,
      useNativeDriver: false,
    }).start();
  }, [pct, delay]);

  const animatedWidth = widthAnim.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={barStyles.track}>
      <Animated.View style={[barStyles.fill, { width: animatedWidth, backgroundColor: color }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: {
    flex:            1,
    height:          8,
    backgroundColor: '#1A1A1A',
    borderRadius:    4,
    overflow:        'hidden',
  },
  fill: {
    height:       8,
    borderRadius: 4,
  },
});

export default function CostComparisonChart({ data }: CostComparisonChartProps) {
  const allValues = data.flatMap(d => [d.solo, d.carpool]);
  const maxValue  = Math.max(...allValues, 1);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={SOLO_COLOR}    label="Solo Driving" />
        <LegendDot color={CARPOOL_COLOR} label="With Carpool"  />
        <LegendDot color={SAVINGS_COLOR} label="You Save"      />
      </View>

      {data.map((item, idx) => (
        <View key={idx} style={styles.row}>
          <Text style={styles.periodLabel}>{item.label}</Text>

          <View style={styles.bars}>
            <View style={styles.barRow}>
              <Text style={[styles.barLabel, { color: SOLO_COLOR }]}>Solo</Text>
              <AnimatedBar value={item.solo}    maxValue={maxValue} color={SOLO_COLOR}    delay={idx * 100} />
              <Text style={styles.barValue}>₹{Math.round(item.solo).toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.barRow}>
              <Text style={[styles.barLabel, { color: CARPOOL_COLOR }]}>Pool</Text>
              <AnimatedBar value={item.carpool} maxValue={maxValue} color={CARPOOL_COLOR} delay={idx * 100 + 100} />
              <Text style={styles.barValue}>₹{Math.round(item.carpool).toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.barRow}>
              <Text style={[styles.barLabel, { color: SAVINGS_COLOR }]}>Save</Text>
              <AnimatedBar value={Math.max(item.savings, 0)} maxValue={maxValue} color={SAVINGS_COLOR} delay={idx * 100 + 200} />
              <Text style={[styles.barValue, { color: SAVINGS_COLOR }]}>
                ₹{Math.round(Math.max(item.savings, 0)).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius:    16,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#2E2E2E',
    gap:             16,
  },
  legend: {
    flexDirection: 'row',
    gap:           16,
    flexWrap:      'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  legendDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  legendText: {
    fontSize:  11,
    color:     '#9CA3AF',
    fontWeight: '500',
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    paddingTop:     12,
    gap:            10,
  },
  periodLabel: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#FFFFFF',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  bars: {
    gap: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  barLabel: {
    fontSize:   10,
    fontWeight: '700',
    width:      30,
    letterSpacing: 0.3,
  },
  barValue: {
    fontSize:   10,
    fontWeight: '600',
    color:      '#9CA3AF',
    width:      68,
    textAlign:  'right',
  },
});
