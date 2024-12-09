// Core version statuses - Define possible states of a content version
export enum VersionStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
    ARCHIVED = 'archived'
  }
  
  // Version & tag structures - Define core data structures for version management
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
  
  // State management - Define how content versions and states are tracked
  export interface ContentState {
    currentVersion: number;
    versions: Version[];
    tags: { [key: string]: Tag };
    content: string | null;
    publishHistory: PublishRecord[];
  }
  
  // Change tracking - tracking differences between versions
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
  
  // Publishing system - Track publishing events and history
  export interface PublishRecord {
    versionId: number;
    publishedAt: string;
    publishedBy: string;
  }
  
  // API response types - Standardized response structures for the API
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

  // Thêm các interface mới cho API requests
  export interface CreateVersionRequest {
    content: string;
    message: string;
  }
  
  export interface PublishVersionRequest {
    publishedBy: string;
  }
  
  export interface CreateTagRequest {
    versionId: number;
    name: string;
  }
  
  export interface UpdateTagRequest {
    newName: string;
  }
  
  export interface RevertVersionRequest {
    versionId: number;
  }
  
  export type VersionListItem = Omit<Version, 'content' | 'diff'>;