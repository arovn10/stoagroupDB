/**
 * Azure Blob Storage for deal pipeline attachments.
 * When AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER are set,
 * uploads/downloads use blob storage so files persist across redeploys.
 */

import { BlobServiceClient, BlockBlobClient } from '@azure/storage-blob';

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER || 'deal-pipeline-attachments';

export function isBlobStorageConfigured(): boolean {
  return Boolean(CONNECTION_STRING && CONTAINER_NAME);
}

function getBlobClient(blobPath: string): BlockBlobClient | null {
  if (!CONNECTION_STRING || !CONTAINER_NAME) return null;
  const client = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  const container = client.getContainerClient(CONTAINER_NAME);
  return container.getBlockBlobClient(blobPath);
}

/**
 * Upload buffer to blob at path (e.g. deal-pipeline/123/uuid-file.pdf).
 * Returns the same path for StoragePath in DB.
 */
export async function uploadBufferToBlob(
  blobPath: string,
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  const blob = getBlobClient(blobPath);
  if (!blob) throw new Error('Azure Blob Storage is not configured');
  await blob.uploadData(buffer, {
    blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
  });
  return blobPath;
}

/**
 * Return true if the blob exists in Azure. Use after upload to avoid saving a DB row when the blob didn't persist.
 */
export async function blobExists(blobPath: string): Promise<boolean> {
  const blob = getBlobClient(blobPath);
  if (!blob) return false;
  try {
    await blob.getProperties();
    return true;
  } catch (err: unknown) {
    if (isBlobNotFoundError(err)) return false;
    throw err;
  }
}

/** RestError / blob-not-found check (SDK may put code in details). */
function isBlobNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const o = err as { code?: string; statusCode?: number; details?: { code?: string; errorCode?: string } };
  const code = o.code ?? o.details?.code ?? o.details?.errorCode;
  const statusCode = o.statusCode;
  return (
    statusCode === 404 ||
    code === 'BlobNotFound' ||
    msg.includes('does not exist') ||
    msg.includes('BlobNotFound') ||
    msg.includes('404')
  );
}

/**
 * Download blob to stream. Caller pipes to response.
 * Returns null if the blob does not exist (e.g. attachment was created before Azure was configured).
 */
export async function downloadBlobToStream(
  blobPath: string
): Promise<{ readableStream: NodeJS.ReadableStream; contentType?: string } | null> {
  const blob = getBlobClient(blobPath);
  if (!blob) return null;
  try {
    const download = await blob.download();
    return {
      readableStream: download.readableStreamBody!,
      contentType: download.contentType,
    };
  } catch (err: unknown) {
    if (isBlobNotFoundError(err)) return null;
    throw err;
  }
}

/**
 * Download blob to buffer. For scripts that need full file (e.g. KMZ parse).
 * Returns null if the blob does not exist. Catches BlobNotFound when it occurs during stream read.
 */
export async function downloadBlobToBuffer(blobPath: string): Promise<Buffer | null> {
  const result = await downloadBlobToStream(blobPath);
  if (!result) return null;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of result.readableStream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    if (isBlobNotFoundError(err)) return null;
    throw err;
  }
}

/**
 * Delete blob if it exists.
 */
export async function deleteBlob(blobPath: string): Promise<boolean> {
  const blob = getBlobClient(blobPath);
  if (!blob) return false;
  try {
    await blob.deleteIfExists();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure container exists (call once at startup if using blob).
 */
export async function ensureContainerExists(): Promise<void> {
  if (!CONNECTION_STRING || !CONTAINER_NAME) return;
  const client = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  const container = client.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();
}
