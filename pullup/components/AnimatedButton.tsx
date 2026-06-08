import {
    ANIMATION_TIMINGS
} from '@/utils/animationConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
    ActivityIndicator,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    ViewStyle
} from 'react-native';

interface AnimatedButtonProps {
  onPress: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  text: string;
  icon?: string;
  showIcon?: boolean;
  style?: ViewStyle;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
}

/**
 * Unified Animated Button Component
 * Provides consistent styling and animations across all auth pages
 * Inspired by production apps like Uber, Rapido, OLA
 */
export const AnimatedButton = ({
  onPress,
  disabled = false,
  isLoading = false,
  text,
  icon = 'arrow-right',
  showIcon = true,
  style,
  variant = 'primary',
  size = 'large',
  fullWidth = true,
}: AnimatedButtonProps) => {
  const { scale, animatePress } = useButtonPressAnimation();
  const stateAnimation = useButtonStateAnimation();
  const isInteractiveRef = useRef(!disabled && !isLoading);

  useEffect(() => {
    isInteractiveRef.current = !disabled && !isLoading;
    if (disabled || isLoading) {
      stateAnimation.animateDisabled();
    } else {
      stateAnimation.animateEnabled();
    }
  }, [disabled, isLoading]);

  const handlePress = () => {
    if (!disabled && !isLoading && isInteractiveRef.current) {
      animatePress();
      // Add small delay for visual feedback before executing action
      setTimeout(() => {
        onPress();
      }, ANIMATION_TIMINGS.FAST / 2);
    }
  };

  const buttonStyle = getButtonStyle(variant, disabled, size, fullWidth);
  const contentStyle = getContentStyle(size);

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: Animated.multiply(scale, stateAnimation.scale) }],
          opacity: stateAnimation.opacity,
        },
        style,
      ]}
    >
      <TouchableOpacity
        style={[buttonStyle, styles.button]}
        onPress={handlePress}
        disabled={disabled || isLoading}
        activeOpacity={0.8}
      >
        <Animated.View style={[contentStyle, styles.buttonContent]}>
          {isLoading ? (
            <ActivityIndicator
              color={variant === 'primary' ? '#1A1A1A' : '#FFFFFF'}
              size={size === 'small' ? 'small' : 'large'}
            />
          ) : (
            <>
              <Text
                style={getTextStyle(variant, disabled, size)}
                numberOfLines={1}
              >
                {text}
              </Text>
              {showIcon && (
                <MaterialCommunityIcons
                  name={icon as any}
                  size={getIconSize(size)}
                  color={variant === 'primary' ? '#1A1A1A' : '#FFFFFF'}
                  style={styles.buttonIcon}
                />
              )}
            </>
          )}
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Helper function to get button animation
const useButtonPressAnimation = () => {
  const scale = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.95,
        duration: ANIMATION_TIMINGS.FAST,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { scale, animatePress };
};

// Helper function to get state animation
const useButtonStateAnimation = () => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateDisabled = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0.6,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.98,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateEnabled = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ANIMATION_TIMINGS.STANDARD,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return { scale, opacity, animateDisabled, animateEnabled };
};

// Styles helper functions
const getButtonStyle = (
  variant: string,
  disabled: boolean,
  size: string,
  fullWidth: boolean
) => {
  const baseStyle: ViewStyle = {
    borderRadius: size === 'small' ? 20 : 30,
    paddingVertical: size === 'small' ? 12 : size === 'medium' ? 18 : 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: disabled ? { width: 0, height: 2 } : { width: 0, height: 6 },
    shadowOpacity: disabled ? 0.05 : 0.15,
    shadowRadius: disabled ? 4 : 12,
    elevation: disabled ? 1 : 5,
    width: fullWidth ? '100%' : 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (variant === 'primary') {
    return {
      ...baseStyle,
      backgroundColor: disabled ? '#E5E7EB' : '#FFFFFF',
    };
  }

  return {
    ...baseStyle,
    backgroundColor: disabled ? '#1E1E1E' : '#1A1A1A',
    borderWidth: 1.5,
    borderColor: disabled ? '#333333' : '#FFFFFF',
  };
};

const getTextStyle = (variant: string, disabled: boolean, size: string) => {
  return {
    fontSize: size === 'small' ? 14 : size === 'medium' ? 16 : 20,
    fontWeight: '800' as const,
    color: disabled
      ? '#999999'
      : variant === 'primary'
        ? '#121212'
        : '#FFFFFF',
    letterSpacing: 0.3,
  };
};

const getContentStyle = (size: string): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: size === 'small' ? 6 : 10,
});

const getIconSize = (size: string) => {
  return size === 'small' ? 16 : size === 'medium' ? 18 : 20;
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
  },
  buttonContent: {
    gap: 10,
  },
  buttonIcon: {
    marginLeft: 4,
  },
});
