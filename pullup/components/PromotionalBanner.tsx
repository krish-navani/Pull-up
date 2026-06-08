import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';

interface PromotionalBannerProps {
  title?: string;
  description?: string;
  buttonText?: string;
  onButtonPress?: () => void;
}

export default function PromotionalBanner({
  title = 'Host your first ride!',
  description = 'Earn up to ₹500 weekly by\nsharing your commute.',
  buttonText = 'GET STARTED',
  onButtonPress,
}: PromotionalBannerProps) {
  return (
    <View style={styles.bannerContainer}>
      {/* Left Content */}
      <View style={styles.leftContent}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={onButtonPress}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>{buttonText}</Text>
        </TouchableOpacity>
      </View>

      {/* Right Icon */}
      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            name="piggy-bank"
            size={56}
            color="#FFFFFF"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  } as ViewStyle,
  leftContent: {
    flex: 1,
    gap: 12,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 24,
  } as TextStyle,
  description: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    lineHeight: 20,
  } as TextStyle,
  button: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  } as ViewStyle,
  buttonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  } as TextStyle,
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
});
