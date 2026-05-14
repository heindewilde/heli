import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { collectionPipelineSync, collections, pipelines } from './schema';

export type SyncLink = {
  collectionId: string;
  collectionName: string;
  pipelineId: string;
  pipelineName: string;
};

export async function getCollectionSync(
  userId: string,
  region: string,
  collectionId: string
): Promise<SyncLink | null> {
  const d = db(region);
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
        eq(collectionPipelineSync.userId, userId)
      )
    )
    .get();
  return row ?? null;
}

export async function getPipelineSync(
  userId: string,
  region: string,
  pipelineId: string
): Promise<SyncLink | null> {
  const d = db(region);
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
        eq(collectionPipelineSync.userId, userId)
      )
    )
    .get();
  return row ?? null;
}

export async function createCollectionSync(
  userId: string,
  region: string,
  collectionId: string,
  pipelineId: string
): Promise<void> {
  const d = db(region);
  await d
    .insert(collectionPipelineSync)
    .values({ collectionId, pipelineId, userId, createdAt: Date.now() })
    .onConflictDoNothing();
}

export async function deleteCollectionSync(
  userId: string,
  region: string,
  collectionId: string
): Promise<void> {
  const d = db(region);
  await d
    .delete(collectionPipelineSync)
    .where(
      and(
        eq(collectionPipelineSync.collectionId, collectionId),
        eq(collectionPipelineSync.userId, userId)
      )
    );
}
