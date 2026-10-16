import { useEffect, type ReactNode } from 'react';
import { useAuth } from './auth-gate';
import { StudyProvider, useStudy } from './study-provider';
import { useNotionImports, useNotionUpdates } from '@/lib/notion-client';
import { mergeNotionPages } from '@/lib/notion-model';
import { LearningProvider } from './learning-provider';
import { RecallSessionProvider } from './recall-session-provider';

export function AccountWorkspace({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <StudyProvider key={user.id} userId={user.id}><LearningProvider><RecallSessionProvider userId={user.id}><NotionHydrator />{children}</RecallSessionProvider></LearningProvider></StudyProvider>;
}
function NotionHydrator() {
  const { user } = useAuth(); const { data, ready, update } = useStudy();
  const imports = useNotionImports(); useNotionUpdates();
  useEffect(() => {
    if (!ready || !imports.data?.length) return;
    const fresh = imports.data.filter(page => {
      const previous = data.notionImports?.[`${user.id}:${page.id}`];
      return !previous || previous.text !== page.text || previous.title !== page.title || previous.subject !== page.subject;
    });
    if (fresh.length) update(d => mergeNotionPages(d, fresh, user.id));
  }, [imports.data, data.notionImports, ready, update, user.id]);
  return null;
}
