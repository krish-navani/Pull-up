import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/utils/firebase';
import { WARM_CORE } from '@/constants/theme';

interface UserAvatarProps {
  userId?: string | null;
  imageUrl?: string | null;
  name?: string;
  size?: number;
  style?: any;
}

export default function UserAvatar({ userId, imageUrl, name, size = 44, style }: UserAvatarProps) {
  const [hasError, setHasError] = React.useState(false);
  const [liveImage, setLiveImage] = React.useState<string | null>(imageUrl || null);
  const [liveName, setLiveName] = React.useState<string | undefined>(name);

  React.useEffect(() => {
    setLiveImage(imageUrl || null);
    setLiveName(name);
  }, [imageUrl, name]);

  React.useEffect(() => {
    if (!userId) return;
    try {
      const userRef = doc(db, 'publicProfiles', userId);
      const unsub = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.profileImage !== undefined) setLiveImage(data.profileImage);
          if (data.fullName !== undefined) setLiveName(data.fullName);
        }
      }, (err) => {
        console.warn('[AVATAR SYNC] Snapshot error:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('[AVATAR SYNC] Setup error:', e);
    }
  }, [userId]);

  const displayImage = liveImage || imageUrl;
  const displayName = liveName || name;
  const initial = displayName && displayName.trim() ? displayName.trim()[0].toUpperCase() : '?';

  React.useEffect(() => {
    setHasError(false);
  }, [displayImage]);

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  const textStyle = {
    fontSize: size * 0.45,
    fontWeight: '700' as const,
  };

  const rawUrl = displayImage && typeof displayImage === 'string' && displayImage.trim().length > 0 ? displayImage.trim() : null;
  const isLocalOrInvalid = rawUrl ? (rawUrl.startsWith('file://') || rawUrl.startsWith('content://') || rawUrl.startsWith('ph://')) : false;
  const cleanUrl = isLocalOrInvalid ? null : rawUrl;

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
