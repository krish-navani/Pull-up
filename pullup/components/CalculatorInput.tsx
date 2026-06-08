/**
 * CalculatorInput – Premium animated text input
 * Uber/Ola-style with focus glow, floating label, and micro-animations
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

interface CalculatorInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'decimal-pad' | 'email-address';
  unit?: string;
  icon?: string;
  helperText?: string;
  editable?: boolean;
  onReset?: () => void;
  containerStyle?: ViewStyle;
}

export default function CalculatorInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'numeric',
  unit,
  icon,
  helperText,
  editable = true,
  onReset,
  containerStyle,
}: CalculatorInputProps) {
  const focusAnim  = useRef(new Animated.Value(0)).current;
  const isFocused  = useRef(false);

  const animateFocus = (focused: boolean) => {
    isFocused.current = focused;
    Animated.timing(focusAnim, {
      toValue:         focused ? 1 : 0,
      duration:        200,
      useNativeDriver: false,
    }).start();
  };

  const borderColor = focusAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#2A2A2A', '#22C55E'],
  });

  const glowOpacity = focusAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.15],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {unit && (
          <View style={styles.unitBadge}>
            <Text style={styles.unitText}>{unit}</Text>
          </View>
        )}
      </View>

      {/* Animated input wrapper */}
      <Animated.View style={[styles.inputWrapper, { borderColor }, !editable && styles.disabled]}>
        {/* Glow overlay */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, styles.glowOverlay, { opacity: glowOpacity }]}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? '0'}
          placeholderTextColor="#6B7280"
          keyboardType={keyboardType}
          editable={editable}
          onFocus={() => animateFocus(true)}
          onBlur={()  => animateFocus(false)}
          selectionColor="#22C55E"
        />
        {onReset && value !== '' && (
          <TouchableOpacity onPress={onReset} style={styles.resetButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
      </Animated.View>

      {helperText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  labelRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   8,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  label: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#C4C4D0',
    letterSpacing: 0.3,
  },
  unitBadge: {
    backgroundColor: '#1A1A1A',
    borderRadius:    6,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderWidth:  1,
    borderColor:  '#2E2E2E',
  },
  unitText: {
    fontSize:   11,
    fontWeight: '600',
    color:      '#9CA3AF',
    letterSpacing: 0.4,
  },
  inputWrapper: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: '#1A1A1A',
    borderRadius:    14,
    borderWidth:     1.5,
    paddingHorizontal: 16,
    paddingVertical:   14,
    overflow: 'hidden',
  },
  glowOverlay: {
    backgroundColor: '#22C55E',
    borderRadius: 14,
  },
  input: {
    flex:       1,
    fontSize:   18,
    fontWeight: '600',
    color:      '#FFFFFF',
    paddingVertical: 0,
  },
  resetButton: {
    padding: 4,
    marginLeft: 8,
  },
  disabled: {
    backgroundColor: '#0D0D18',
    opacity: 0.5,
  },
  helperText: {
    fontSize:   11,
    color:      '#6B7280',
    marginTop:  6,
    lineHeight: 15,
    letterSpacing: 0.2,
  },
});
