import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { WARM_CORE } from '@/constants/theme';

interface UserAvatarProps {
  imageUrl?: string | null;
  name?: string;
  size?: number;
  style?: any;
}

export default function UserAvatar({ imageUrl, name, size = 44, style }: UserAvatarProps) {
  const [hasError, setHasError] = React.useState(false);
  const initial = name && name.trim() ? name.trim()[0].toUpperCase() : '?';

  React.useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  const textStyle = {
    fontSize: size * 0.45,
    fontWeight: '700' as const,
  };

  const cleanUrl = imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0 ? imageUrl.trim() : null;

  if (cleanUrl && !hasError) {
    return (
      <Image
        source={{ uri: cleanUrl }}
        style={[
          styles.avatarImage,
          containerStyle,
          style,
        ]}
        resizeMode="cover"
        onError={() => {
          console.warn('[AVATAR] Failed to load image:', cleanUrl);
          setHasError(true);
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        containerStyle,
        style,
      ]}
    >
      <Text style={[styles.avatarInitial, textStyle]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    backgroundColor: WARM_CORE.card,
  },
  avatarFallback: {
    backgroundColor: WARM_CORE.primary, // Orange circular background
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: WARM_CORE.white, // White text
  },
});
