import { useCallback } from 'react';
import { Send } from 'lucide-react-native';
import { SimpleList, type SimpleItem } from '../src/features/SimpleList';
import { api } from '../src/api/endpoints';
import { useTheme } from '../src/theme';
import { PLATFORMS, isOutreachPlatform } from '../../src/lib/outreach/platforms';

/**
 * Templates are rendered, copied and logged. Heli never sends — see the note in
 * the v1 handler. This screen lists them; composing lives on a person.
 */
export default function OutreachScreen() {
  const t = useTheme();
  const fetchItems = useCallback(async (): Promise<SimpleItem[]> => {
    const rows = await api.outreach({ limit: 100 });
    return rows.map((o) => ({
      id: String(o.id),
      title: String(o.name),
      subtitle: isOutreachPlatform(o.platform) ? PLATFORMS[o.platform].label : undefined,
      meta: o.visibility === 'private' ? 'Private' : undefined
    }));
  }, []);

  return (
    <SimpleList
      title="Outreach"
      fetch={fetchItems}
      icon={<Send size={22} color={t.c('--color-subtle')} />}
      emptyTitle="No templates yet"
      emptyBody="Write a message once, render it against anyone, copy it and log that you sent it."
    />
  );
}
