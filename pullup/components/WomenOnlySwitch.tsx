import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ROSE = '#C2185B';

export default function WomenOnlySwitch({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E7DCD8', ROSE],
  });
  const panelColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FCEAF1', '#C2185B'],
  });
  const panelBorderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#F2CBD9', '#C2185B'],
  });
  const thumbX = progress.interpolate({ inputRange: [0, 1], outputRange: [3, 25] });

  return (
    <Animated.View style={[styles.row, { backgroundColor: panelColor, borderColor: panelBorderColor }, disabled && styles.disabled]}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="gender-female" size={19} color={value ? '#FFFFFF' : ROSE} />
          <Text style={[styles.title, value && styles.titleActive]}>Women-only rides</Text>
        </View>
        <Text style={[styles.subtitle, value && styles.subtitleActive]}>Only women, drivers and riders.</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel="Women-only rides"
        onPress={() => !disabled && onValueChange(!value)}
        disabled={disabled}
        activeOpacity={0.85}
        hitSlop={8}
      >
        <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
          <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]} />
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FCEAF1',
    borderWidth: 1,
    borderColor: '#F2CBD9',
  },
  disabled: { opacity: 0.6 },
  copy: { flex: 1, paddingRight: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { color: '#482431', fontSize: 14, fontWeight: '700' },
  titleActive: { color: '#FFFFFF' },
  subtitle: { color: '#806571', fontSize: 11, marginTop: 3, marginLeft: 26 },
  subtitleActive: { color: '#FCEAF1' },
  track: { width: 52, height: 30, borderRadius: 15, justifyContent: 'center' },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#3B1625',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
});
