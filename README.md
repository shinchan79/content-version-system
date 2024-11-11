# Content Version System

A Cloudflare Workers-based content versioning system that provides Git-like versioning capabilities for content management. Built with TypeScript and Durable Objects, this system enables robust version control for your content with features similar to Git but optimized for content management workflows.

## Core Features

### Version Control
- **Full Version History**: Track all changes with timestamps and commit messages
- **Diff Comparison**: Compare any two versions to see exact changes
- **Revert Capability**: Roll back to any previous version instantly

### Content Management
- **Publishing Workflow**: Support for Draft, Published, and Archived states
- **Tagging System**: Tag important versions for easy reference
- **Change Tracking**: Detailed history of all modifications

### Advanced Features
- **Detailed Diffs**: View exact changes between versions
- **Publishing History**: Track when and who published each version
- **API-First Design**: RESTful API for easy integration

## API Endpoints

### Content Operations
```typescript
// Create new version
POST /content
Body: { content: string, message?: string }

// Get all versions
GET /content/{id}/versions

// Get specific version
GET /content/{id}/versions/{versionId}

// Delete version
DELETE /content/{id}/versions/{versionId}
```

### Version Control
```typescript
// Revert to version
POST /content/{id}/revert
Body: { versionId: number }

// Compare versions
GET /content/{id}/compare?from={fromId}&to={toId}

// Get diff
GET /content/{id}/diff
```

### Publishing
```typescript
// Publish version
POST /content/{id}/versions/{versionId}/publish
Body: { publishedBy: string }

// Get publish history
GET /content/{id}/publish-history
```

### Tags
```typescript
// Add tag
POST /content/{id}/tags
Body: { versionId: number, tagName: string }
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Storage**: Durable Objects
- **Language**: TypeScript
- **Build Tool**: Wrangler CLI

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Cloudflare Workers account
- Wrangler CLI installed

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/content-version-system.git
cd content-version-system
```

2. Install dependencies
```bash
npm install
```

3. Configure Wrangler
```bash
wrangler login
```

4. Start development server
```bash
npm run dev
```

### Development Commands

```bash
# Start development server
npm run dev

# Run tests
npm test

# Format code
npm run format

# Lint code
npm run lint

# Build for production
npm run build

# Deploy
npm run deploy
```

## Response Types

### Version Object
```typescript
interface Version {
  id: number;
  content: string;
  timestamp: string;
  message: string;
  status: VersionStatus;
  diff?: ContentDiff;
}
```

### Diff Object
```typescript
interface ContentDiff {
  from: string;
  to: string;
  changes: {
    additions: number;
    deletions: number;
    totalChanges: number;
    timestamp: string;
  };
  patch: string;
}
```

## Error Handling

The API uses standard HTTP status codes:
- `200`: Success
- `400`: Bad Request
- `404`: Not Found
- `500`: Server Error

All error responses follow this format:
```typescript
{
  success: false,
  error: string
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support, please open an issue in the GitHub repository.

## Frontend if you need it (I deployed it to Cloudflare Pages):

https://github.com/shinchan79/version-control-frontend

Some settings are hardcoded for my use case, but it's easily customizable.

### Settings for Cloudflare Pages:

- Git repository: https://github.com/shinchan79/version-control-frontend
Build command:npm install && npm run build
- Build output:out
- Root directory:
- Build comments:Enabled
- Build cache: Disabled
Branch control
- Production branch:main
- Automatic deployments:Enabled
-Build watch paths: Include paths: *
- Deploy Hooks: No deploy hooks defined
- Build system version: Version 2

Variables and Secrets:

Plaintext
	NEXT_PUBLIC_API_URL
	https://content-version-system.shinchan79.workers.dev/
  NEXT_TELEMETRY_DISABLED
	1
  NODE_VERSION
	18
  NPM_VERSION
	9

I have deployed it sample here (The link will remain active for a while, but you can always deploy your own):

Frontend: https://8184d626.version-control-frontend.pages.dev/

Backend: https://content-version-system.shinchan79.workers.dev/
