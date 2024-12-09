import { createPatch } from 'diff';
import { 
  ContentDiff, 
  ContentState, 
  Version, 
  PublishRecord, 
  VersionStatus, 
  Tag, 
  CreateVersionRequest,
  PublishVersionRequest,
  CreateTagRequest,
  UpdateTagRequest,
  RevertVersionRequest } from './types';

// Note that the name of the class have to match the name of the Durable Object defined in the wrangler.toml file.
export class ContentDO {
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }
  // TODO: Core Version Control Functions

  // Initialize or get existing state from Durable Objects storage
private async initialize(): Promise<ContentState> {
    // Get existing state from Durable Objects storage
    const stored = await this.state.storage.get<ContentState>("content");
    if (!stored) {
      // Initialize the state if not existed
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
  
  // Calculate next version ID based on existing versions
  private getNextVersionId(data: ContentState): number {
    return data.versions.length > 0 
      ? Math.max(...data.versions.map(v => v.id)) + 1 
      : 1;
  }
  
  // Create a new version with the provided content and message
  async createVersion(content: string, message: string = ""): Promise<Version> {
    const data = await this.initialize();
      
    const newVersion: Version = {
      id: this.getNextVersionId(data),
      content,
      timestamp: new Date().toISOString(),
      message,
      status: VersionStatus.DRAFT,
      diff: data.content ? this.calculateDetailedDiff(data.content, content) : undefined
    };
  
    data.versions.push(newVersion);
    data.currentVersion = newVersion.id;
    data.content = content;
  
    await this.state.storage.put("content", data);
    return newVersion;
  }
  
  // Get all versions
  async getVersions(): Promise<Version[]> {
    const data = await this.initialize();
    return data.versions;
  }
  
  // Get a specific version by ID
  async getVersion(id: number): Promise<Version | null> {
    const data = await this.initialize();
    return data.versions.find(v => v.id === id) || null;
  }
  
  // Delete a specific version by ID
  async deleteVersion(id: number): Promise<{ success: boolean }> {
    const data = await this.initialize();
      
    const versionIndex = data.versions.findIndex(v => v.id === id);
    if (versionIndex === -1) {
      throw new Error("Version not found");
    }
  
    const version = data.versions[versionIndex];
    if (version.status === VersionStatus.PUBLISHED) {
      throw new Error("Cannot delete published version");
    }
  
    data.versions.splice(versionIndex, 1);
  
    if (data.currentVersion === id) {
      data.currentVersion = 0;
      data.content = null;
    }
  
    // Remove any tags associated with this version
    for (const tagName in data.tags) {
      if (data.tags[tagName].versionId === id) {
        delete data.tags[tagName];
      }
    }
  
    await this.state.storage.put("content", data);
    return {
      success: true
    };
  }
  
  // TODO: Tag Management Functions
  async getTags(): Promise<Tag[]> {
    const data = await this.initialize();
    return Object.entries(data.tags).map(([_, tag]) => ({
      ...tag
    }));
  }
  
  async getVersionTags(versionId: number): Promise<Tag[]> {
    const data = await this.initialize();
    return Object.entries(data.tags)
      .filter(([_, tag]) => tag.versionId === versionId)
      .map(([_, tag]) => ({
        ...tag
      }));
  }
  
  async createTag(versionId: number, name: string): Promise<Tag> {
    const data = await this.initialize();
    if (data.tags[name]) {
      throw new Error("Tag already exists");
    }
  
    const version = data.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error("Version not found");
    }
  
    const tag: Tag = {
      name,
      versionId,
      createdAt: new Date().toISOString()
    };
    data.tags[name] = tag;
    await this.state.storage.put("content", data);
    return tag;
  }
  
  async updateTag(name: string, newName: string): Promise<Tag> {
    const data = await this.initialize();
    
    if (!data.tags[name]) {
      throw new Error("Tag not found");
    }
  
    if (data.tags[newName]) {
      throw new Error("New tag name already exists");
    }
  
    const tag = data.tags[name];
    delete data.tags[name];
    data.tags[newName] = {
      ...tag,
      name: newName
    };
  
    await this.state.storage.put("content", data);
    return {
      ...data.tags[newName],
      name: newName
    };
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
  
  // TODO: Publishing and unpublishing functions
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
  
  // Unpublish a version
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
  
  // TODO: Diff and version control operations
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
  
    const newVersion: Version = {
      id: this.getNextVersionId(data),
      content: targetVersion.content,
      timestamp: new Date().toISOString(),
      message: `Reverted to version ${versionId}`,
      status: targetVersion.status,
      diff: this.calculateDetailedDiff(
        data.versions[data.versions.length - 1]?.content || '',
        targetVersion.content
      )
    };
  
    data.versions.push(newVersion);
    await this.state.storage.put("content", data);
    return newVersion;
  }
  
  // TODO: Request handling and routing
  // Entry point for requests to the Durable Object
async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null);
    }
  
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
  
      console.log('ContentDO handling request:', request.method, url.pathname);
      console.log('Parts:', parts);
       // Add detailed logging
      console.log('Request details:');
      console.log('- Method:', request.method);
      console.log('- URL:', request.url);
      console.log('- Path:', url.pathname);
      console.log('- Parts:', parts);
      console.log('- Headers:', Object.fromEntries(request.headers));

      // Log the body if it exists
      if (request.body) {
        const clonedRequest = request.clone();
        const body = await clonedRequest.text();
        console.log('- Body:', body);
      }
  
      const response = await this.handleRequest(request, parts);
      return response;

    } catch (err) {
      const error = err as Error;
      console.error('Error:', error);
      return new Response(error.message, { 
        status: 500
      });
    }
  }
  
  private async handleRequest(request: Request, parts: string[]): Promise<Response> {
    const path = parts.join('/');
    console.log('Handling request:');
    console.log('- Method + Path:', `${request.method} ${path}`);
    console.log('- Looking for match:', `POST content/default/versions/${parts[3]}/publish`);
  
    switch (`${request.method} ${path}`) {
      
      case 'POST content': {
        const body = await request.json() as CreateVersionRequest;
        const version = await this.createVersion(body.content, body.message);
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
        const { versionId, name } = await request.json() as CreateTagRequest;
        const tag = await this.createTag(versionId, name);
        return Response.json(tag);
      }
  
      case `PUT content/versions/tags/${parts[3]}`: {
        const body = await request.json() as UpdateTagRequest;
        const tag = await this.updateTag(parts[3], body.newName);
        return Response.json(tag);
      }
  
      case `DELETE content/versions/tags/${parts[3]}`: {
        const result = await this.deleteTag(parts[3]);
        return Response.json(result);
      }
  
      case `POST content/default/versions/${parts[3]}/publish`: {
        try {
          console.log('Attempting to publish version');
          console.log('Raw request body:', await request.clone().text());
          const { publishedBy } = await request.json() as PublishVersionRequest;
          console.log('Parsed publishedBy:', publishedBy);
          const result = await this.publishVersion(parseInt(parts[3]), publishedBy);
          return Response.json(result);
        } catch (err) {
          const error = err as Error;
          console.error('Error in publish handler:', error);
          return new Response(error.message, { status: 500 });
        }
      }
  
      case `POST content/default/versions/${parts[3]}/unpublish`: {
        const result = await this.unpublishVersion(parseInt(parts[3]));
        return Response.json(result);
      }
  
      case 'GET content/default/publish-history': {
        const history = await this.getPublishHistory();
        return Response.json(history);
      }
  
      case `GET content/default/versions/${parts[3]}/diff`: {
        const compareToId = parseInt(new URL(request.url).searchParams.get('compare') || '0');
        if (compareToId) {
          return await this.getDiff(parseInt(parts[3]), compareToId);
        }
        const diff = await this.compareVersions(parseInt(parts[3]), parseInt(parts[3]) - 1);
        return Response.json(diff);
      }
  
      case `POST content/default/revert`: {
        const body = await request.json() as RevertVersionRequest;
        const version = await this.revertTo(body.versionId);
        return Response.json(version);
      }
  
      default:
        return new Response('No route matched: ' + request.method + ' ' + path, { status: 404 });
    }
  }
}