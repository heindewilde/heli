import { View } from 'react-native';
import type { ReactNode } from 'react';
import { Text } from './Text';
import { useTheme } from '../theme';

/**
 * The screen someone sees most often on their first day.
 *
 * Worth more care than it usually gets: an empty list that says "No results" is
 * a dead end, and it is the moment a new app either explains itself or doesn't.
 * So every empty state here takes a `title` that says what *would* be here and
 * a `body` that says how to get one — and, where there is a next step, an
 * action rather than a suggestion.
 *
 * The distinction that matters is *why* it is empty. "You have no people yet"
 * and "nothing matched 'bergman'" want completely different words, and showing
 * the first when the second is true makes the app look like it lost the data.
 */
export function EmptyState({
  icon,
  title,
  body,
  action
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingVertical: 56,
        gap: 10
      }}
    >
      {icon ? (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.c('--color-surface-2'),
            marginBottom: 4
          }}
        >
          {icon}
        </View>
      ) : null}
      <Text variant="lg" weight="600" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" variant="sm" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}
