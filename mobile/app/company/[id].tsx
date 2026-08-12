import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink, Globe, MapPin, Users } from 'lucide-react-native';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { Avatar } from '../../src/ui/Avatar';
import { EmptyState } from '../../src/ui/EmptyState';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { useRows, useWorkspace } from '../../src/db/sync';
import { getCompany, peopleAtCompany } from '../../src/db/cache';

/**
 * One company.
 *
 * A company is mostly a container for its people, so that is what this leads
 * with — the web page's sidebar of industry and location fields is secondary
 * here, because the question you open a company to answer on a phone is
 * "who do I know here".
 */
export default function CompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ws = useWorkspace();


  const { rows: company } = useRows(
    'companies',
    async () => (ws && id ? getCompany(ws, id) : null),
    [ws, id]
  );
  const { rows: people } = useRows(
    'people',
    async () => (ws && id ? peopleAtCompany(ws, id) : []),
    [ws, id]
  );

  if (!company) {
    return <View style={{ flex: 1, backgroundColor: t.c('--color-bg'), paddingTop: insets.top }} />;
  }

  const staff = people ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.c('--color-bg') }}>
      <View
        style={{
          paddingTop: insets.top,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          height: insets.top + 44
        }}
      >
        <Pressable press="button" onPress={() => router.back()} accessibilityLabel="Back" style={{ padding: 8 }}>
          <ChevronLeft size={26} color={t.c('--color-interactive')} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 20 }}>
          <Avatar
            name={company.name}
            uri={company.logoUrl ?? company.faviconUrl}
            size="xl"
            shape="square"
          />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text variant="2xl" weight="700" style={{ textAlign: 'center' }}>
              {company.name}
            </Text>
            {company.industry || company.location ? (
              <Text tone="muted" variant="sm" style={{ textAlign: 'center' }}>
                {[company.industry, company.location].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          {company.url ? (
            <Pressable
              press="button"
              onPress={() => {
                haptics.tick();
                void Linking.openURL(company.url!);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 18,
                backgroundColor: t.c('--color-surface-2')
              }}
            >
              <Globe size={14} color={t.c('--color-interactive')} />
              <Text variant="xs" weight="500" tone="accent">
                {company.domain ?? 'Website'}
              </Text>
              <ExternalLink size={12} color={t.c('--color-subtle')} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Text variant="xs" weight="600" tone="muted">
            {staff.length > 0 ? `PEOPLE · ${staff.length}` : 'PEOPLE'}
          </Text>

          {staff.length === 0 ? (
            <EmptyState
              icon={<Users size={22} color={t.c('--color-subtle')} />}
              title="Nobody linked yet"
              body={`People you save with ${company.name} as their employer will appear here.`}
            />
          ) : (
            <View
              style={{
                borderRadius: t.radius.md,
                backgroundColor: t.c('--color-surface'),
                borderWidth: 1,
                borderColor: t.c('--color-border'),
                overflow: 'hidden'
              }}
            >
              {staff.map((p, idx) => (
                <Pressable
                  key={p.id}
                  press="row"
                  onPress={() => router.push(`/person/${p.id}`)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingHorizontal: 13,
                    paddingVertical: 11,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: t.c('--color-border')
                  }}
                >
                  <Avatar name={p.name} uri={p.avatarUrl} size="sm" />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text variant="sm" weight="500" numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.role ? (
                      <Text variant="2xs" tone="muted" numberOfLines={1}>
                        {p.role}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {company.location ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingTop: 8
              }}
            >
              <MapPin size={13} color={t.c('--color-subtle')} />
              <Text variant="xs" tone="muted">
                {company.location}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
