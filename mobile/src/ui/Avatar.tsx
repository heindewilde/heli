import { View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from './Text';
import { useTheme } from '../theme';
// Shared with the web app: the same name produces the same initials in both.
import { initialsOf } from '../../../src/lib/initials';

/**
 * A person or company mark.
 *
 * `expo-image` rather than RN's `Image`: it has a real disk cache, decodes off
 * the main thread, and — the part that matters here — supports a crossfade on
 * load. A list that pops in avatars one by one at full opacity looks like it is
 * struggling; the same list fading them over 180ms looks considered.
 *
 * The initials fallback sits *behind* the image rather than being swapped in on
 * error, so there is never an empty square: the letters are visible from the
 * first frame and the photo fades over them.
 */

const SIZES = { sm: 28, md: 40, lg: 64, xl: 88 };

export type AvatarProps = {
  name: string;
  uri?: string | null;
  size?: keyof typeof SIZES;
  /** Companies get a rounded square; people get a circle. */
  shape?: 'circle' | 'square';
};

export function Avatar({ name, uri, size = 'md', shape = 'circle' }: AvatarProps) {
  const t = useTheme();
  const px = SIZES[size];

  return (
    <View
      accessible
      accessibilityLabel={name}
      style={{
        width: px,
        height: px,
        borderRadius: shape === 'circle' ? px / 2 : t.radius.sm,
        backgroundColor: t.c('--color-surface-2'),
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      <Text
        variant={px >= 64 ? 'xl' : px >= 40 ? 'sm' : '2xs'}
        weight="600"
        tone="muted"
        allowFontScaling={false}
      >
        {initialsOf(name)}
      </Text>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: px, height: px }}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}
