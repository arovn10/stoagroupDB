import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const DEAL_PIPELINE_SUBDIR = 'deal-pipeline';
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

export function getDealPipelineUploadDir(dealPipelineId: number): string {
  const dir = path.join(UPLOAD_DIR, DEAL_PIPELINE_SUBDIR, String(dealPipelineId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getFullPath(storagePath: string): string {
  return path.join(UPLOAD_DIR, storagePath);
}

/** Path relative to UPLOAD_DIR for storing in DB (portable). */
export function getRelativeStoragePath(fullPath: string): string {
  return path.relative(UPLOAD_DIR, fullPath).split(path.sep).join('/');
}

/**
 * Multer config for deal pipeline attachments.
 * Expects route param :id to be DealPipelineId.
 * Field name: "file"
 */
export const dealPipelineAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = req.params?.id;
      if (!id) {
        cb(new Error('Deal pipeline id is required'), '');
        return;
      }
      const dealPipelineId = parseInt(id, 10);
      if (isNaN(dealPipelineId)) {
        cb(new Error('Invalid deal pipeline id'), '');
        return;
      }
      const dir = getDealPipelineUploadDir(dealPipelineId);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const base = sanitizeFileName(path.basename(file.originalname, ext));
      const name = `${randomUUID()}-${base}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
});
