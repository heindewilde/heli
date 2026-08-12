import { useCallback } from 'react';
import { FolderOpen } from 'lucide-react-native';
import { SimpleList, type SimpleItem } from '../src/features/SimpleList';
import { api } from '../src/api/endpoints';
import { useTheme } from '../src/theme';

export default function CollectionsScreen() {
  const t = useTheme();
  const fetchItems = useCallback(async (): Promise<SimpleItem[]> => {
    const rows = await api.collections({ limit: 100 });
    return rows.map((c) => ({
      id: String(c.id),
      title: String(c.name),
      subtitle: (c.description as string) || undefined,
      meta: memberCount(c)
    }));
  }, []);

  return (
    <SimpleList
      title="Collections"
      fetch={fetchItems}
      icon={<FolderOpen size={22} color={t.c('--color-subtle')} />}
      emptyTitle="No collections yet"
      emptyBody="A collection is a named group of people and companies — “warm intros”, “speakers I follow”."
    />
  );
}

function memberCount(c: Record<string, unknown>): string | undefined {
  const people = Number(c.peopleCount ?? 0);
  const companies = Number(c.companiesCount ?? 0);
  const total = people + companies;
  return total > 0 ? `${total}` : undefined;
}
