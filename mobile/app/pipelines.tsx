import { useCallback } from 'react';
import { GitBranch } from 'lucide-react-native';
import { SimpleList, type SimpleItem } from '../src/features/SimpleList';
import { api } from '../src/api/endpoints';
import { useTheme } from '../src/theme';

export default function PipelinesScreen() {
  const t = useTheme();
  const fetchItems = useCallback(async (): Promise<SimpleItem[]> => {
    const rows = await api.pipelines({ limit: 100 });
    return rows.map((p) => ({
      id: String(p.id),
      title: String(p.name),
      subtitle: (p.description as string) || undefined,
      // open · won · lost, the same three numbers the web row shows.
      meta: [p.openCount, p.wonCount, p.lostCount].every((n) => n === undefined)
        ? undefined
        : `${p.openCount ?? 0} open`
    }));
  }, []);

  return (
    <SimpleList
      title="Pipelines"
      fetch={fetchItems}
      icon={<GitBranch size={22} color={t.c('--color-subtle')} />}
      emptyTitle="No pipelines yet"
      emptyBody="A pipeline tracks people and companies through stages you name."
    />
  );
}
