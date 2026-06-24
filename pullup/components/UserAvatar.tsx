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
  const initial = name && name.trim() ? name.trim()[0].toUpperCase() : '?';

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  const textStyle = {
    fontSize: size * 0.45,
    fontWeight: '700' as const,
  };

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[
          styles.avatarImage,
          containerStyle,
          style,
        ]}
        resizeMode="cover"
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
    backgroundColor: WARM_CORE.text, // WARM_CORE.text is #1E120D
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: WARM_CORE.white, // white / cream text
  },
});
