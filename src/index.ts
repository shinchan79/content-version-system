import { ContentDO } from './contentDO';
import { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { Version } from './types';

type Env = {
  CONTENT: DurableObjectNamespace;
};

// Error handling types and helpers
interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return 'Unknown error occurred';
}

// HTML Template & Styling
const getHtmlTemplate = (content: string, message: string = '', timestamp: string = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Version System</title>
    <style>
        body {
            font-family: system-ui, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .content {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            white-space: pre-wrap;
        }
        .button {
            background: #0070f3;
            color: white;
            padding: 12px 24px;
            border-radius: 5px;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
        }
        .button:hover {
            background: #0051a2;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .meta {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <h1>Content Version System</h1>
    <div class="content">
        <div class="meta">
            <strong>Message:</strong> ${message}<br>
            <strong>Last Updated:</strong> ${new Date(timestamp).toLocaleString()}
        </div>
        <h2>Current Content:</h2>
        <pre>${content}</pre>
    </div>
  <a href="https://content-version-system.sycu-lee.workers.dev" class="button">Content Version Management</a> # Replace to your worker url
</body>
</html>
`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getLatestPublishedVersion(contentDO: DurableObjectStub, origin: string): Promise<Version | null> {
  const versionsResponse = await contentDO.fetch(`${origin}/content/default/versions`);
  const versions: Version[] = await versionsResponse.json(); // Explicitly type the response

  const publishedVersions = versions.filter(v => v.status === 'published');
  if (publishedVersions.length === 0) {
    return null;
  }

  return publishedVersions.reduce((latest, current) => 
    latest.id > current.id ? latest : current
  );
}

export { ContentDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Get Durable Objects instance
      const doId = env.CONTENT.idFromName('default');
      const contentDO = env.CONTENT.get(doId);

      // Handle root path - show HTML view
      if (url.pathname === '/') {
        try {
          const latestPublished = await getLatestPublishedVersion(contentDO, url.origin);
          
          if (latestPublished) {
            const contentResponse = await contentDO.fetch(
              `${url.origin}/content/default/versions/${latestPublished.id}`
            );
            const contentData: Version = await contentResponse.json(); // Explicitly type the response
            
            return new Response(
              getHtmlTemplate(
                contentData.content || 'No content available',
                contentData.message,
                contentData.timestamp
              ), {
                headers: { 'Content-Type': 'text/html' }
              }
            );
          } else {
            return new Response(
              getHtmlTemplate('No published content available', 'No published versions', ''), {
                headers: { 'Content-Type': 'text/html' }
              }
            );
          }
        } catch (error) {
          console.error('Root error:', error);
          return new Response(
            getHtmlTemplate('Error loading content', 'Error occurred', ''), {
              headers: { 'Content-Type': 'text/html' }
            }
          );
        }
      }

      // Special handling for /content/default
      if (url.pathname === '/content/default') {
        try {
          const latestPublished = await getLatestPublishedVersion(contentDO, url.origin);
          
          if (latestPublished) {
            const contentResponse = await contentDO.fetch(
              `${url.origin}/content/default/versions/${latestPublished.id}`
            );
            const contentData: Version = await contentResponse.json(); // Explicitly type the response

            return new Response(JSON.stringify(contentData), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          } else {
            return new Response(JSON.stringify({ error: 'No published content available' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
        } catch (error) {
          console.error('Content default error:', error);
          return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }

      // Forward all other requests to Durable Objects
      const response = await contentDO.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // Add CORS headers
      const newResponse = new Response(response.body, response);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });
      
      return newResponse;

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: getErrorMessage(error)
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }
  }
};