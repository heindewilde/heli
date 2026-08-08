import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { collectionPipelineSync, collections, pipelines } from './schema';
import type { Scope } from './scope';

export type SyncLink = {
  collectionId: string;
  collectionName: string;
  pipelineId: string;
  pipelineName: string;
};

export async function getCollectionSync(
  s: Scope,
  collectionId: string
): Promise<SyncLink | null> {
  const d = db(s.region);
  const row = await d
    .select({
      collectionId: collectionPipelineSync.collectionId,
      pipelineId: collectionPipelineSync.pipelineId,
      collectionName: collections.name,
      pipelineName: pipelines.name
    })
    .from(collectionPipelineSync)
    .innerJoin(collections, eq(collections.id, collectionPipelineSync.collectionId))
    .innerJoin(pipelines, eq(pipelines.id, collectionPipelineSync.pipelineId))
    .where(
      and(
        eq(collectionPipelineSync.collectionId, collectionId),
        eq(collectionPipelineSync.workspaceId, s.workspaceId)
      )
    )
    .get();
  return row ?? null;
}

export async function getPipelineSync(
  s: Scope,
  pipelineId: string
): Promise<SyncLink | null> {
  const d = db(s.region);
  const row = await d
    .select({
      collectionId: collectionPipelineSync.collectionId,
      pipelineId: collectionPipelineSync.pipelineId,
      collectionName: collections.name,
      pipelineName: pipelines.name
    })
    .from(collectionPipelineSync)
    .innerJoin(collections, eq(collections.id, collectionPipelineSync.collectionId))
    .innerJoin(pipelines, eq(pipelines.id, collectionPipelineSync.pipelineId))
    .where(
      and(
        eq(collectionPipelineSync.pipelineId, pipelineId),
        eq(collectionPipelineSync.workspaceId, s.workspaceId)
      )
    )
    .get();
  return row ?? null;
}

export async function createCollectionSync(
  s: Scope,
  collectionId: string,
  pipelineId: string
): Promise<void> {
  const d = db(s.region);
  // PK is collection_id, so this silently no-ops when a sync already exists
  // rather than re-pointing it. With multiple members two people can now race
  // here; first writer wins, which is the behaviour we already had.
  await d
    .insert(collectionPipelineSync)
    .values({
      collectionId,
      pipelineId,
      workspaceId: s.workspaceId,
      userId: s.userId,
      createdAt: Date.now()
    })
    .onConflictDoNothing();
}

export async function deleteCollectionSync(
  s: Scope,
  collectionId: string
): Promise<void> {
  const d = db(s.region);
  await d
    .delete(collectionPipelineSync)
    .where(
      and(
        eq(collectionPipelineSync.collectionId, collectionId),
        eq(collectionPipelineSync.workspaceId, s.workspaceId)
      )
    );
}
