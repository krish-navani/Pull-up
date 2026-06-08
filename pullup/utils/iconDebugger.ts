/**
 * Icon Debugger Utility
 * 
 * This utility helps identify and fix icon-related issues in the app
 * Use this during development to ensure all icons load properly
 */

import { ICONS_IN_USE, ICON_FALLBACKS, VALID_ICONS } from './iconValidator';

interface IconIssue {
  type: 'missing' | 'invalid' | 'unused';
  icon: string;
  severity: 'critical' | 'warning' | 'info';
  suggestion: string;
}

/**
 * Performs comprehensive icon diagnostics
 */
export function diagnoseIconIssues(): IconIssue[] {
  const issues: IconIssue[] = [];

  // Check 1: Find icons used in app that don't exist
  ICONS_IN_USE.forEach((icon) => {
    if (!VALID_ICONS[icon as keyof typeof VALID_ICONS]) {
      issues.push({
        type: 'invalid',
        icon,
        severity: ICON_FALLBACKS[icon] ? 'warning' : 'critical',
        suggestion: ICON_FALLBACKS[icon]
          ? `Icon "${icon}" is unavailable. Using fallback: "${ICON_FALLBACKS[icon]}"`
          : `Icon "${icon}" is unavailable. Replace with a valid icon from @expo/vector-icons`,
      });
    }
  });

  // Check 2: Warn about potentially unused valid icons
  const definedButUnused = Object.keys(VALID_ICONS).filter(
    (icon) => !ICONS_IN_USE.includes(icon)
  );

  // Only show info warnings for a few uncommon ones to reduce noise
  const deprecatedWarnings = ['loading']; // loading might be deprecated in newer versions
  definedButUnused.forEach((icon) => {
    if (deprecatedWarnings.includes(icon)) {
      issues.push({
        type: 'unused',
        icon,
        severity: 'info',
        suggestion: `Icon "${icon}" is defined but not used. Consider removing it if not needed.`,
      });
    }
  });

  return issues;
}

/**
 * Prints icon diagnostics to console in a readable format
 */
export function printIconDiagnostics(): void {
  const issues = diagnoseIconIssues();

  console.log('\n📊 ICON DIAGNOSTICS REPORT');
  console.log('================================\n');

  if (issues.length === 0) {
    console.log('✅ All icons are properly configured!\n');
    console.log(`Total valid icons: ${Object.keys(VALID_ICONS).length}`);
    console.log(`Icons in use: ${ICONS_IN_USE.length}\n`);
    return;
  }

  // Group by severity
  const critical = issues.filter((i) => i.severity === 'critical');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const info = issues.filter((i) => i.severity === 'info');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL ISSUES:');
    critical.forEach((issue) => {
      console.log(`  - ${issue.icon}`);
      console.log(`    → ${issue.suggestion}\n`);
    });
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:');
    warnings.forEach((issue) => {
      console.log(`  - ${issue.icon}`);
      console.log(`    → ${issue.suggestion}\n`);
    });
  }

  if (info.length > 0) {
    console.log('ℹ️  INFO:');
    info.forEach((issue) => {
      console.log(`  - ${issue.icon}`);
      console.log(`    → ${issue.suggestion}\n`);
    });
  }

  console.log('================================\n');
}

/**
 * Checks icon loading on app startup
 * Call this from AppContext useEffect or app initialization
 */
export async function initializeIconValidation(): Promise<boolean> {
  try {
    const issues = diagnoseIconIssues();
    const criticalIssues = issues.filter((i) => i.severity === 'critical');

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Only log in development
      if (criticalIssues.length > 0) {
        console.warn('⚠️  Icon loading issues detected:', criticalIssues);
      } else {
        console.log('✅ Icon validation passed');
      }
    }

    return criticalIssues.length === 0;
  } catch (error) {
    console.error('❌ Error during icon validation:', error);
    return false;
  }
}

/**
 * Get suggestions for fixing invalid icons
 */
export function getIconFixSuggestions(): string[] {
  const issues = diagnoseIconIssues();
  const critical = issues.filter((i) => i.severity === 'critical');

  if (critical.length === 0) return [];

  return critical.map((issue) => {
    const validAlternatives = Object.keys(VALID_ICONS).filter((icon) =>
      icon.includes(issue.icon.split('-')[0])
    );

    return `"${issue.icon}" → Try: ${validAlternatives.slice(0, 3).join(', ')} (or use fallback: "${ICON_FALLBACKS[issue.icon] || 'circle'}")`;
  });
}

/**
 * Export diagnostics as JSON for logging services
 */
export function exportIconMetrics() {
  const issues = diagnoseIconIssues();
  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalIcons: Object.keys(VALID_ICONS).length,
      iconsInUse: ICONS_IN_USE.length,
      issuesFound: issues.length,
      criticalIssues: issues.filter((i) => i.severity === 'critical').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
    issues: issues,
  };
}
