import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Blush-pink palette aligned with app's warm core
const BLUSH_ACTIVE = '#D4608A';      // rich blush rose
const BLUSH_TRACK_ON = '#D4608A';
const BLUSH_TRACK_OFF = '#DEC8CE';
const PANEL_ACTIVE_BG = '#F9E4ED';
const PANEL_INACTIVE_BG = '#FDF7F9';
const PANEL_ACTIVE_BORDER = '#E8A0BF';
const PANEL_INACTIVE_BORDER = '#EDD8E1';

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
  // Gentle pulse when active
  const glowScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  // Start gentle icon pulse when active
  useEffect(() => {
    if (value) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.18, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      Animated.timing(glowScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [value, glowScale]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [BLUSH_TRACK_OFF, BLUSH_TRACK_ON],
  });
  const panelBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_INACTIVE_BG, PANEL_ACTIVE_BG],
  });
  const panelBorderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PANEL_INACTIVE_BORDER, PANEL_ACTIVE_BORDER],
  });
  const thumbX = progress.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });
  const titleOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Animated.View
      style={[
        styles.row,
        { backgroundColor: panelBg, borderColor: panelBorderColor },
        disabled && styles.disabled,
      ]}
    >
      {/* Left: icon + copy */}
      <View style={styles.left}>
        {/* Icon circle */}
        <Animated.View style={[styles.iconCircle, value && styles.iconCircleActive, { transform: [{ scale: glowScale }] }]}>
          <MaterialCommunityIcons
            name="gender-female"
            size={18}
            color={value ? '#FFFFFF' : BLUSH_ACTIVE}
          />
        </Animated.View>

        <View style={styles.copy}>
          <Animated.Text style={[styles.title, { opacity: titleOpacity, color: value ? '#7B1D45' : '#5C2A3A' }]}>
            Women-only rides
          </Animated.Text>
          <Text style={[styles.subtitle, value && styles.subtitleActive]}>
            {value ? 'Showing rides for women only ✨' : 'Only women drivers & passengers'}
          </Text>
        </View>
      </View>

      {/* Right: toggle */}
      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel="Women-only rides toggle"
        onPress={() => !disabled && onValueChange(!value)}
        disabled={disabled}
        activeOpacity={0.82}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.toggleWrapper}
      >
        <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
          <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbX }] }]}>
            {value && (
              <MaterialCommunityIcons name="check" size={12} color={BLUSH_ACTIVE} />
            )}
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1.2,
    // Shadow
    shadowColor: '#C2185B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  disabled: { opacity: 0.55 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FCEAF1',
    borderWidth: 1,
    borderColor: '#EAB3CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: BLUSH_ACTIVE,
    borderColor: BLUSH_ACTIVE,
    shadowColor: BLUSH_ACTIVE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  copy: { flex: 1 },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  subtitle: {
    color: '#9E6B7E',
    fontSize: 11,
    lineHeight: 14,
  },
  subtitleActive: { color: '#C2185B' },
  toggleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: 48,
    height: 27,
    borderRadius: 14,
    justifyContent: 'center',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B1625',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 3,
  },
});
