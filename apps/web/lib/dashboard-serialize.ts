import type { ArtifactDoc } from "./models";

export interface ArtifactSummary {
  artifactId: string;
  /** Newest live share URL, attached by the dashboard list query; absent elsewhere. */
  liveShareUrl?: string | null;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLinkSummary {
  linkId: string;
  url: string;
  expiresAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function serializeForDashboard(doc: ArtifactDoc): ArtifactSummary {
  return {
    artifactId: doc.artifactId,
    filename: doc.filename,
    contentType: doc.contentType,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
