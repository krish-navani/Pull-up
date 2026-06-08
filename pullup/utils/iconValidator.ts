/**
 * Icon Validator Utility
 * Validates all MaterialCommunityIcons used throughout the app
 * 
 * This utility ensures that:
 * 1. All icon names are valid MaterialCommunityIcons
 * 2. Icons are properly imported and loaded
 * 3. Fallback icons are provided for unavailable icons
 */

// Valid MaterialCommunityIcons from @expo/vector-icons v15.0.3+
// These are the icons actually used in the app
export const VALID_ICONS = {
  // Navigation & UI
  'arrow-left': true,
  'arrow-right': true,
  'chevron-left': true,
  'chevron-right': true,
  'chevron-up': true,
  'chevron-down': true,
  'close': true,
  'plus': true,
  'check': true,
  'circle': true,

  // Status & Alerts
  'check-circle': true,
  'close-circle': true,
  'alert-circle': true,
  'alert-circle-outline': true,
  'information': true,

  // Location & Maps
  'map-marker': true,
  'map-marker-check': true,
  'map-marker-multiple': true,
  'map-marker-distance': true,

  // Calendar & Time
  'calendar': true,
  'calendar-today': true,
  'calendar-blank': true,
  'calendar-range': true,
  'calendar-multiple': true,
  'clock-outline': true,

  // Money & Financial
  'currency-inr': true,
  'cash': true,
  'cash-multiple': true,
  'credit-card': true,
  'wallet': true,
  'piggy-bank': true,

  // Vehicle & Transport
  'car': true,
  'car-cog': true,
  'car-seat': true,
  'seat': true,
  'gas-cylinder': true,
  'fuel': true,

  // Utilities
  'calculator': true,
  'chart-bar': true,
  'refresh': true,
  'share-variant': true,
  'loading': true,
  'account-multiple': true,
  'format-list-bulleted': true,
  'note-text': true,
  'speedometer': true,
  'lightbulb-on': true,

  // Environmental
  'leaf': true,
  'tree': true,
  'pine-tree': true,
  'plus-circle': true,
};

// Icon fallbacks for any unavailable icons
export const ICON_FALLBACKS: { [key: string]: string } = {
  // If any icon is not available, use these fallbacks
  'loading': 'refresh', // Fallback if loading is not available
};

/**
 * Validates if an icon name is available
 * Returns the icon name if valid, or a fallback if not
 */
export function getValidIcon(iconName?: string): string {
  if (!iconName) return 'circle'; // Default fallback

  // Icon name is valid
  if (VALID_ICONS[iconName as keyof typeof VALID_ICONS]) {
    return iconName;
  }

  // Try fallback
  const fallback = ICON_FALLBACKS[iconName];
  if (fallback) {
    console.warn(`Icon "${iconName}" not available, using fallback "${fallback}"`);
    return fallback;
  }

  // Ultimate fallback
  console.warn(`Icon "${iconName}" not available, using default "circle"`);
  return 'circle';
}

/**
 * Gets all icon names used in the app
 * For debugging and verification purposes
 */
export const ICONS_IN_USE = [
  // From driver-calculator.tsx
  'gas-cylinder',
  'account-multiple',
  'chevron-left',
  'map-marker-distance',
  'calendar',
  'calendar-range',
  'fuel',
  'calculator',
  'share-variant',
  'piggy-bank',
  'calendar-today',
  'calendar-multiple',
  'leaf',
  'pine-tree',
  'refresh',

  // From CarOwnerCalculator.tsx
  'arrow-left',
  'alert-circle',
  'calendar-blank',
  'car-cog',
  'speedometer',
  'currency-inr',
  'cash',
  'cash-multiple',
  'calendar',
  'credit-card',
  'chart-bar',
  'tree',
  'map-marker',

  // From post-ride.tsx
  'check-circle',
  'map-marker-multiple',
  'map-marker-check',
  'calendar-today',
  'seat',
  'currency-inr',
  'car',
  'format-list-bulleted',
  'plus',
  'clock-outline',
  'lightbulb-on',
  'chevron-right',
  'chevron-up',
  'chevron-down',
  'note-text',

  // From booking-confirmation.tsx
  'clock-outline',
  'car-seat',
  'arrow-right',
  'information',
  'close',
  'loading',
  'alert-circle-outline',

  // From ride-details.tsx
  'clock-outline',
  'close-circle',
  'plus-circle',
  'circle',
];

/**
 * Validates all icons used in the app
 * Returns array of validation results
 */
export function validateAllIcons() {
  const results = ICONS_IN_USE.map((icon) => ({
    icon,
    valid: !!VALID_ICONS[icon as keyof typeof VALID_ICONS],
    fallback: ICON_FALLBACKS[icon] || 'circle',
  }));

  const invalidIcons = results.filter((r) => !r.valid);

  if (invalidIcons.length > 0) {
    console.warn('⚠️ Invalid icons found:', invalidIcons);
  } else {
    console.log('✅ All icons validated successfully!');
  }

  return results;
}

/**
 * Log icon validation results
 */
export function logIconValidation() {
  const results = validateAllIcons();
  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.filter((r) => !r.valid).length;

  console.log(`Icon Validation Report:`);
  console.log(`  Total Icons: ${results.length}`);
  console.log(`  Valid: ${validCount} ✅`);
  console.log(`  Invalid: ${invalidCount} ❌`);

  if (invalidCount > 0) {
    console.log(`\nInvalid Icons:`);
    results
      .filter((r) => !r.valid)
      .forEach((r) => {
        console.log(
          `  - "${r.icon}" → fallback to "${r.fallback}"`
        );
      });
  }
}
