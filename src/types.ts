export enum VersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export interface Version {
  id: number;
  content: string;
  timestamp: string;
  message: string;
  diff?: ContentDiff;
  status: VersionStatus;
}

export interface Tag {
  name: string;
  versionId: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ContentState {
  currentVersion: number;
  versions: Version[];
  tags: { [key: string]: Tag };
  content: string | null;
  publishHistory: PublishRecord[];
}

export interface ContentDiff {
  from: string;
  to: string;
  changes: {
    additions: number;
    deletions: number;
    totalChanges: number;
    timestamp: string;
  };
  patch: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

export interface PublishRecord {
  versionId: number;
  publishedAt: string;
  publishedBy: string;
}

// Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DeleteVersionResponse {
  success: boolean;
  message: string;
}

export interface TagResponse {
  tagName: string;
  versionId: number;
}

export interface CurrentVersionResponse {
  version: number;
  content: string | null;
}

export type VersionListItem = Omit<Version, 'content' | 'diff'>;