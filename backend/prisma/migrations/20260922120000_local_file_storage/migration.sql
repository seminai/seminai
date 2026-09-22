-- Rename leftover GCS column names on inbound email attachments.
ALTER TABLE "EmailAttachment" RENAME COLUMN "gcsUrl" TO "storageUrl";
ALTER TABLE "EmailAttachment" RENAME COLUMN "gcsPath" TO "storagePath";
