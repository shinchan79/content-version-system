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

export interface ContentState {
  currentVersion: number;
  versions: Version[];
  tags: Record<string, number>;
  content: string | null;
  publishHistory: PublishRecord[];
}

export interface CreateVersionParams {
  content: string;
  message?: string;
}

export interface RevertParams {
  versionId: number;
}

export interface TagParams {
  versionId: number;
  tagName: string;
}

export interface DeleteVersionParams {
  versionId: number;
}

export interface PublishRecord {
  versionId: number;
  publishedAt: string;
  publishedBy: string;
}

export interface PublishVersionParams {
  versionId: number;
  publishedBy: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
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

export interface VersionResponse extends ApiResponse<Version> {}
export interface ListVersionsResponse extends ApiResponse<Version[]> {}
