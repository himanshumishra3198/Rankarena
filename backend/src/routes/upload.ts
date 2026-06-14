import { Router, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireAdmin);

const REGION = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_BUCKET || "";

// Credentials resolve from the standard AWS env vars
// (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) automatically.
const s3 = new S3Client({ region: REGION });

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

// In-memory storage (small images), 5 MB cap, images only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, or WebP images are allowed."));
  },
});

// POST /admin/upload — form field "image". Returns { url }.
router.post("/", (req: AuthRequest, res: Response) => {
  upload.single("image")(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || "Upload failed" });
      return;
    }
    if (!BUCKET) {
      res.status(500).json({ error: "Image storage is not configured (S3_BUCKET missing)." });
      return;
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No image file provided." });
      return;
    }

    const ext = EXT[file.mimetype] ?? "bin";
    const key = `questions/${crypto.randomUUID()}.${ext}`;

    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable",
      }));
      const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
      res.status(201).json({ url });
    } catch (e: any) {
      console.error("S3 upload failed:", e?.message ?? e);
      res.status(500).json({ error: "Failed to upload image to storage." });
    }
  });
});

export default router;
