/**
 * Breakdown Card Component
 * Shows detailed breakdown of costs
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

interface BreakdownItem {
  label: string;
  value: number;
  icon?: string;
  percentage?: number;
}

interface BreakdownCardProps {
  title: string;
  items: BreakdownItem[];
  total: number;
  showPercentages?: boolean;
}

export default function BreakdownCard({
  title,
  items,
  total,
  showPercentages = false,
}: BreakdownCardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.itemsContainer}>
        {items.map((item, idx) => (
          <View key={idx}>
            <View style={styles.item}>
              <View style={styles.itemLeft}>
                {item.icon && (
                  <MaterialCommunityIcons name={item.icon as any} size={16} color="#9CA3AF" />
                )}
                <Text style={styles.itemLabel}>{item.label}</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemValue}>₹{Math.round(item.value).toLocaleString('en-IN')}</Text>
                {showPercentages && item.percentage !== undefined && (
                  <Text style={styles.percentage}>{item.percentage.toFixed(1)}%</Text>
                )}
              </View>
            </View>
            {idx < items.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>₹{Math.round(total).toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  itemsContainer: {
    marginBottom: 10,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  itemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  percentage: {
    fontSize: 10,
    color: '#6B7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#2E2E2E',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2E2E2E',
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
