import { createPatch } from 'diff';
import { ContentDiff, ContentState, Version, PublishRecord, VersionStatus } from './types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ContentDO {
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);

      // Log để debug
      console.log('ContentDO handling request:', request.method, url.pathname);
      console.log('Parts:', parts);

      // Xử lý các routes
      const response = await this.handleRequest(request, parts);
      
      // Thêm CORS headers vào response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (err) {
      const error = err as Error;
      console.error('Error:', error);
      return new Response(error.message, { 
        status: 500,
        headers: corsHeaders
      });
    }
  }

  private async handleRequest(request: Request, parts: string[]): Promise<Response> {
    switch (`${request.method} ${parts.join('/')}`) {
      case 'POST content': {
        const { content, message } = await request.json();
        const version = await this.createVersion(content, message);
        return Response.json(version);
      }

      // Route cho diff mặc định (2 version mới nhất)
      case `GET content/${parts[1]}/diff`: {
        const data = await this.initialize();
        const latestVersion = data.versions[data.versions.length - 1];
        const previousVersion = data.versions[data.versions.length - 2];
        if (!latestVersion || !previousVersion) {
            throw new Error("Not enough versions to compare");
        }
        return await this.getDiff(previousVersion.id, latestVersion.id);
      }

      // Route cho diff với version được chỉ định
      case `GET content/${parts[1]}/versions/${parts[3]}/diff`: {
        const url = new URL(request.url);
        const compareWithVersion = url.searchParams.get('compare');
        const versionId = parseInt(parts[3]);
        
        if (compareWithVersion) {
            // So sánh với version được chỉ định
            return await this.getDiff(parseInt(compareWithVersion), versionId);
        } else {
            // So sánh với version liền trước
            return await this.getDiff(versionId - 1, versionId);
        }
      }

      case `PUT content/${parts[1]}`: {
        const { content, message } = await request.json();
        const version = await this.createVersion(content, message);
        return Response.json(version);
      }

      case `GET content/${parts[1]}/versions`: {
        const versions = await this.getVersions();
        return Response.json(versions);
      }

      case `GET content/${parts[1]}/versions/${parts[3]}`: {
        const version = await this.getVersion(parseInt(parts[3]));
        return Response.json(version);
      }

      case `POST content/${parts[1]}/revert`: {
        const { versionId } = await request.json();
        const version = await this.revertTo(versionId);
        return Response.json(version);
      }

      case `POST content/${parts[1]}/tags`: {
        const { versionId, tagName } = await request.json();
        const tag = await this.addTag(versionId, tagName);
        return Response.json(tag);
      }

      case `DELETE content/${parts[1]}/versions/${parts[3]}`: {
        const versionId = parseInt(parts[3]);
        const result = await this.deleteVersion(versionId);
        return Response.json(result);
      }

      case `POST content/${parts[1]}/versions/${parts[3]}/publish`: {
        const { publishedBy } = await request.json();
        const result = await this.publishVersion(parseInt(parts[3]), publishedBy);
        return Response.json(result);
      }

      case `GET content/${parts[1]}/publish-history`: {
        const history = await this.getPublishHistory();
        return Response.json(history);
      }

      case `GET content/${parts[1]}/compare`: {
        const url = new URL(request.url);
        const fromId = parseInt(url.searchParams.get('from') || '');
        const toId = parseInt(url.searchParams.get('to') || '');
        
        if (isNaN(fromId) || isNaN(toId)) {
          return new Response('Invalid version IDs', { status: 400 });
        }

        const diff = await this.compareVersions(fromId, toId);
        return Response.json(diff);
      }

      default:
        console.log('No route matched:', request.method, parts.join('/'));
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }
  }

  async initialize(): Promise<ContentState> {
    const stored = await this.state.storage.get<ContentState>("content");
    if (!stored) {
      const initialData: ContentState = {
        currentVersion: 0,
        versions: [],
        tags: {},
        content: null,
        publishHistory: []
      };
      await this.state.storage.put("content", initialData);
      return initialData;
    }
    // Ensure backward compatibility
    if (!stored.publishHistory) {
      stored.publishHistory = [];
    }
    return stored;
  }

  async createVersion(content: string, message?: string): Promise<Version> {
    const data = await this.initialize();
    
    // Tìm ID lớn nhất hiện tại
    const maxId = Math.max(...data.versions.map(v => v.id), 0);

    // Tạo version mới
    const newVersion: Version = {
        id: maxId + 1,
        content: content,
        timestamp: new Date().toISOString(),
        message: message || 'New version',
        status: VersionStatus.DRAFT
    };

    // Tính toán diff với version trước đó
    if (data.versions.length > 0) {
        const previousVersion = data.versions[data.versions.length - 1];
        const diffResult = createPatch('content.txt',
            previousVersion.content,
            content,
            `Version ${previousVersion.id}`,
            `Version ${newVersion.id}`
        );

        // Tính toán số dòng thay đổi
        const additions = (diffResult.match(/^\+/gm) || []).length - 1;
        const deletions = (diffResult.match(/^-/gm) || []).length - 1;

        newVersion.diff = {
            from: previousVersion.content,
            to: content,
            changes: {
                additions: additions,
                deletions: deletions,
                totalChanges: additions + deletions,
                timestamp: new Date().toISOString()
            },
            patch: diffResult,
            hunks: []
        };
    }

    // Thêm version mới vào danh sách
    data.versions.push(newVersion);
    await this.state.storage.put("content", data);
    
    return newVersion;
  }

  async getCurrentVersion(): Promise<{ version: number; content: string | null }> {
    const data = await this.initialize();
    return {
      version: data.currentVersion,
      content: data.content
    };
  }

  async getVersions(): Promise<Omit<Version, 'content' | 'diff'>[]> {
    const data = await this.initialize();
    return data.versions.map(({ id, timestamp, message, status }) => ({
      id,
      timestamp,
      message,
      status
    }));
  }

  async getVersion(versionId: number): Promise<Version> {
    const data = await this.initialize();
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }
    return version;
  }

  async revertTo(versionId: number): Promise<Version> {
    const data = await this.initialize();
    const targetVersion = data.versions.find(v => v.id === versionId);
    if (!targetVersion) {
      throw new Error("Version not found");
    }

    return await this.createVersion(targetVersion.content, `Reverted to version ${versionId}`);
  }

  async addTag(versionId: number, tagName: string): Promise<{ tagName: string; versionId: number }> {
    const data = await this.initialize();
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    data.tags[tagName] = versionId;
    await this.state.storage.put("content", data);
    return { tagName, versionId };
  }

  async deleteVersion(versionId: number): Promise<{ success: boolean, message: string }> {
    const data = await this.initialize();
    
    // Không cho phép xóa version hiện tại
    if (versionId === data.currentVersion) {
      throw new Error("Cannot delete current version");
    }

    const versionIndex = data.versions.findIndex(v => v.id === versionId);
    if (versionIndex === -1) {
      throw new Error("Version not found");
    }

    // Xóa version
    data.versions.splice(versionIndex, 1);

    // Nếu còn versions, cập nhật diff cho version tiếp theo
    if (versionIndex < data.versions.length) {
      const prevContent = versionIndex > 0 
        ? data.versions[versionIndex - 1].content 
        : "";
      data.versions[versionIndex].diff = this.calculateDetailedDiff(
        prevContent,
        data.versions[versionIndex].content
      );
    }

    // Xóa tags trỏ đến version này
    for (const [tag, tagVersionId] of Object.entries(data.tags)) {
      if (tagVersionId === versionId) {
        delete data.tags[tag];
      }
    }

    // Xóa publish history của version này
    if (data.publishHistory) {
      data.publishHistory = data.publishHistory.filter(
        record => record.versionId !== versionId
      );
    }

    await this.state.storage.put("content", data);
    return { 
      success: true, 
      message: `Version ${versionId} deleted successfully` 
    };
  }

  async publishVersion(versionId: number, publishedBy: string): Promise<PublishRecord> {
    const data = await this.initialize();
    const version = data.versions.find(v => v.id === versionId);
    
    if (!version) {
      throw new Error("Version not found");
    }

    const publishRecord: PublishRecord = {
      versionId,
      publishedAt: new Date().toISOString(),
      publishedBy
    };

    if (!data.publishHistory) {
      data.publishHistory = [];
    }
    data.publishHistory.push(publishRecord);

    // Update current version
    data.currentVersion = versionId;
    data.content = version.content;
    version.status = VersionStatus.PUBLISHED;

    await this.state.storage.put("content", data);
    return publishRecord;
  }

  async getPublishHistory(): Promise<PublishRecord[]> {
    const data = await this.initialize();
    return data.publishHistory || [];
  }

  async compareVersions(fromId: number, toId: number): Promise<ContentDiff> {
    const data = await this.initialize();
    
    const fromVersion = data.versions.find(v => v.id === fromId);
    const toVersion = data.versions.find(v => v.id === toId);
    
    if (!fromVersion || !toVersion) {
      throw new Error("Version not found");
    }

    return this.calculateDetailedDiff(fromVersion.content, toVersion.content);
  }

  private calculateDetailedDiff(oldContent: string, newContent: string): ContentDiff {
    const patch = createPatch('content',
      oldContent,
      newContent,
      'old version',
      'new version'
    );

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    return {
      from: oldContent,
      to: newContent,
      changes: {
        additions: newLines.length - oldLines.length,
        deletions: Math.max(0, oldLines.length - newLines.length),
        totalChanges: Math.abs(newLines.length - oldLines.length),
        timestamp: new Date().toISOString()
      },
      patch: patch,
      hunks: []
    };
  }

  private analyzeDiff(oldContent: string, newContent: string): {
    additions: number;
    deletions: number;
    totalChanges: number;
    timestamp: string;
  } {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    return {
      additions: newLines.length - oldLines.length,
      deletions: Math.max(0, oldLines.length - newLines.length),
      totalChanges: Math.abs(newLines.length - oldLines.length),
      timestamp: new Date().toISOString()
    };
  }

  async getDiff(fromVersionId: number, toVersionId: number): Promise<Response> {
    const data = await this.initialize();
    const fromVersion = data.versions.find(v => v.id === fromVersionId);
    const toVersion = data.versions.find(v => v.id === toVersionId);
    
    if (!fromVersion || !toVersion) {
        throw new Error("Version not found");
    }

    const formattedDiff = [
        `Comparing Version ${fromVersion.id} -> Version ${toVersion.id}`,
        `From: ${fromVersion.message}`,
        `To: ${toVersion.message}`,
        '\nContent in Version ' + fromVersion.id + ':',
        fromVersion.content,
        '\nContent in Version ' + toVersion.id + ':',
        toVersion.content,
        '\nDifferences:',
        '===================================================================',
        createPatch('content.txt',
            fromVersion.content || '',
            toVersion.content || '',
            `Version ${fromVersion.id} (${fromVersion.message})`,
            `Version ${toVersion.id} (${toVersion.message})`
        )
    ].join('\n');

    return new Response(formattedDiff, {
        headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
        }
    });
  }
}