/**
 * Multi-Select Toggle Component
 * Used for number of riders and pricing model selection
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ToggleOption {
  id: string | number;
  label: string;
  icon?: string;
  description?: string;
}

interface MultiSelectToggleProps {
  options: ToggleOption[];
  selectedId: string | number;
  onSelect: (id: string | number) => void;
  label: string;
  horizontal?: boolean;
  multiSelect?: boolean;
}

export default function MultiSelectToggle({
  options,
  selectedId,
  onSelect,
  label,
  horizontal = false,
  multiSelect = false,
}: MultiSelectToggleProps) {
  const containerStyle = horizontal
    ? { flexDirection: 'row' as const, gap: 8, paddingHorizontal: 0 }
    : { gap: 10, paddingHorizontal: 0 };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={containerStyle}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={[
              styles.optionButton,
              selectedId === option.id && styles.optionButtonActive,
              horizontal && styles.horizontalOption,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                selectedId === option.id && styles.optionTextActive,
              ]}
            >
              {option.label}
            </Text>
            {option.description && (
              <Text
                style={[
                  styles.optionDescription,
                  selectedId === option.id && styles.optionDescriptionActive,
                ]}
              >
                {option.description}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  optionButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5,
    borderColor: '#2E2E2E',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  optionButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  horizontalOption: {
    flex: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  optionTextActive: {
    color: '#0F0F0F',
  },
  optionDescription: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  optionDescriptionActive: {
    color: '#4B5563',
  },
});
