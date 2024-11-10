import { createPatch } from 'diff';
import { ContentDiff, ContentState, Version, PublishRecord, VersionStatus, Tag } from './types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export class ContentDO {
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);

      console.log('ContentDO handling request:', request.method, url.pathname);
      console.log('Parts:', parts);

      const response = await this.handleRequest(request, parts);
      
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
    const path = parts.join('/');
    console.log('Handling path:', request.method, path);

    switch (`${request.method} ${path}`) {
      // Version endpoints
      case 'POST content': {
        const { content, message } = await request.json();
        const version = await this.createVersion(content, message);
        return Response.json(version);
      }

      case 'GET content/default': {
        const data = await this.initialize();
        if (!data.currentVersion) {
          return Response.json(null);
        }
        const version = await this.getVersion(data.currentVersion);
        return Response.json(version);
      }

      case 'GET content/default/versions': {
        const versions = await this.getVersions();
        return Response.json(versions);
      }

      case `GET content/default/versions/${parts[3]}`: {
        const version = await this.getVersion(parseInt(parts[3]));
        return Response.json(version);
      }

      case `DELETE content/default/versions/${parts[3]}`: {
        const versionId = parseInt(parts[3]);
        const result = await this.deleteVersion(versionId);
        return Response.json(result);
      }

      // Tag endpoints
      case 'GET content/versions/tags': {
        const tags = await this.getTags();
        return Response.json(tags);
      }

      case `GET content/versions/${parts[2]}/tags`: {
        const versionId = parseInt(parts[2]);
        const tags = await this.getVersionTags(versionId);
        return Response.json(tags);
      }

      case 'POST content/versions/tags': {
        const { versionId, name } = await request.json();
        const tag = await this.createTag(versionId, name);
        return Response.json(tag);
      }

      case `PUT content/versions/tags/${parts[3]}`: {
        const { newName } = await request.json();
        const tag = await this.updateTag(parts[3], newName);
        return Response.json(tag);
      }

      case `DELETE content/versions/tags/${parts[3]}`: {
        const result = await this.deleteTag(parts[3]);
        return Response.json(result);
      }

      // Publish endpoints
      case `POST content/default/versions/${parts[3]}/publish`: {
        const { publishedBy } = await request.json();
        const result = await this.publishVersion(parseInt(parts[3]), publishedBy);
        return Response.json(result);
      }

      case `POST content/default/versions/${parts[3]}/unpublish`: {
        const result = await this.unpublishVersion(parseInt(parts[3]));
        return Response.json(result);
      }

      case 'GET content/default/publish-history': {
        const history = await this.getPublishHistory();
        return Response.json(history);
      }

      // Diff endpoints
      case `GET content/default/versions/${parts[3]}/diff`: {
        const compareToId = parseInt(new URL(request.url).searchParams.get('compare') || '0');
        if (compareToId) {
          return await this.getDiff(parseInt(parts[3]), compareToId);
        }
        const diff = await this.compareVersions(parseInt(parts[3]), parseInt(parts[3]) - 1);
        return Response.json(diff);
      }

      case `POST content/default/revert`: {
        const { versionId } = await request.json();
        const version = await this.revertTo(versionId);
        return Response.json(version);
      }

      default:
        return new Response('No route matched: ' + request.method + ' ' + path, { status: 404 });
    }
  }

  private async initialize(): Promise<ContentState> {
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
    return stored;
  }

  // Version operations
  async createVersion(content: string, message: string = ""): Promise<Version> {
    const data = await this.initialize();
    
    const newVersion: Version = {
      id: data.versions.length + 1,
      content,
      timestamp: new Date().toISOString(),
      message,
      status: VersionStatus.DRAFT,
      diff: data.content ? this.calculateDetailedDiff(data.content, content) : null
    };

    data.versions.push(newVersion);
    data.currentVersion = newVersion.id;
    data.content = content;

    await this.state.storage.put("content", data);
    return newVersion;
  }

  async getVersion(id: number): Promise<Version | null> {
    const data = await this.initialize();
    return data.versions.find(v => v.id === id) || null;
  }

  async getVersions(): Promise<Version[]> {
    const data = await this.initialize();
    return data.versions;
  }

  async deleteVersion(id: number): Promise<{ success: boolean; message: string }> {
    const data = await this.initialize();
    const versionIndex = data.versions.findIndex(v => v.id === id);
    
    if (versionIndex === -1) {
      throw new Error("Version not found");
    }

    // Remove version
    data.versions.splice(versionIndex, 1);

    // Update current version if needed
    if (data.currentVersion === id) {
      const lastVersion = data.versions[data.versions.length - 1];
      data.currentVersion = lastVersion ? lastVersion.id : 0;
      data.content = lastVersion ? lastVersion.content : null;
    }

    // Remove related tags
    Object.entries(data.tags).forEach(([tagName, tag]) => {
      if (tag.versionId === id) {
        delete data.tags[tagName];
      }
    });

    await this.state.storage.put("content", data);

    return {
      success: true,
      message: `Version ${id} deleted successfully`
    };
  }

  // Tag operations
  async getTags(): Promise<Tag[]> {
    const data = await this.initialize();
    return Object.values(data.tags);
  }

  async getVersionTags(versionId: number): Promise<Tag[]> {
    const data = await this.initialize();
    return Object.values(data.tags).filter(tag => tag.versionId === versionId);
  }

  async createTag(versionId: number, name: string): Promise<Tag> {
    const data = await this.initialize();
    
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    if (data.tags[name]) {
      throw new Error("Tag name already exists");
    }

    const newTag: Tag = {
      name,
      versionId,
      createdAt: new Date().toISOString()
    };

    data.tags[name] = newTag;
    await this.state.storage.put("content", data);
    return newTag;
  }

  async updateTag(oldName: string, newName: string): Promise<Tag> {
    const data = await this.initialize();
    
    const oldTag = data.tags[oldName];
    if (!oldTag) {
      throw new Error("Tag not found");
    }

    if (oldName !== newName && data.tags[newName]) {
      throw new Error("New tag name already exists");
    }

    const updatedTag: Tag = {
      ...oldTag,
      name: newName,
      updatedAt: new Date().toISOString()
    };

    delete data.tags[oldName];
    data.tags[newName] = updatedTag;

    await this.state.storage.put("content", data);
    return updatedTag;
  }

  async deleteTag(name: string): Promise<{ success: boolean; message: string }> {
    const data = await this.initialize();
    
    if (!data.tags[name]) {
      throw new Error("Tag not found");
    }

    delete data.tags[name];
    await this.state.storage.put("content", data);

    return {
      success: true,
      message: `Tag ${name} deleted successfully`
    };
  }

  // Publish operations
  async publishVersion(versionId: number, publishedBy: string): Promise<PublishRecord> {
    const data = await this.initialize();
    
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    data.versions = data.versions.map(v => ({
      ...v,
      status: v.id === versionId ? VersionStatus.PUBLISHED : VersionStatus.DRAFT
    }));

    const publishRecord: PublishRecord = {
      versionId,
      publishedAt: new Date().toISOString(),
      publishedBy
    };

    if (!data.publishHistory) {
      data.publishHistory = [];
    }
    data.publishHistory.push(publishRecord);

    data.currentVersion = versionId;
    data.content = version.content;

    await this.state.storage.put("content", data);
    return publishRecord;
  }

  async unpublishVersion(versionId: number): Promise<Version> {
    const data = await this.initialize();
    
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    data.versions = data.versions.map(v => ({
      ...v,
      status: v.id === versionId ? VersionStatus.DRAFT : v.status
    }));

    if (data.publishHistory) {
      data.publishHistory = data.publishHistory.filter(
        record => record.versionId !== versionId
      );
    }

    if (data.currentVersion === versionId) {
      data.currentVersion = 0;
      data.content = null;
    }

    await this.state.storage.put("content", data);
    
    const updatedVersion = data.versions.find(v => v.id === versionId);
    if (!updatedVersion) {
      throw new Error("Failed to get updated version");
    }

    return updatedVersion;
  }

  async getPublishHistory(): Promise<PublishRecord[]> {
    const data = await this.initialize();
    return data.publishHistory || [];
  }

  // Diff operations
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

  async revertTo(versionId: number): Promise<Version> {
    const data = await this.initialize();
    const targetVersion = data.versions.find(v => v.id === versionId);
    if (!targetVersion) {
      throw new Error("Version not found");
    }

    return await this.createVersion(
      targetVersion.content, 
      `Reverted to version ${versionId}`
    );
  }
}