/**
 * SafeIcon Component
 * 
 * A wrapper around MaterialCommunityIcons that ensures icons
 * are always available and properly loaded with fallback support
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { getValidIcon } from '../utils/iconValidator';

interface SafeIconProps {
  name?: string;
  size?: number;
  color?: string;
  style?: any;
  testID?: string;
}

/**
 * SafeIcon Component
 * 
 * Usage:
 * <SafeIcon name="check-circle" size={24} color="#fff" />
 * 
 * Features:
 * - Validates icon name before rendering
 * - Provides fallback if icon is unavailable
 * - Transparent error handling
 * - Consistent sizing and styling
 */
export const SafeIcon: React.FC<SafeIconProps> = ({
  name,
  size = 24,
  color = '#000',
  style,
  testID,
}) => {
  const validIcon = getValidIcon(name);

  return (
    <MaterialCommunityIcons
      name={validIcon as any}
      size={size}
      color={color}
      style={style}
      testID={testID || `icon-${validIcon}`}
    />
  );
};

export default SafeIcon;
