import { ContentDO } from './contentDO';

interface Env {
  CONTENT: DurableObjectNamespace;
}

// HTML template
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
    <a href="http://localhost:3000" class="button">Content Version Management</a>
</body>
</html>
`;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Helper function to get latest published version
async function getLatestPublishedVersion(contentDO: DurableObjectInstance, origin: string) {
  const versionsResponse = await contentDO.fetch(new Request(origin + '/content/default/versions'));
  const versions = await versionsResponse.json();

  // Filter published versions and get the latest one
  const publishedVersions = versions.filter((v: any) => v.status === 'published');
  if (publishedVersions.length === 0) {
    return null;
  }

  return publishedVersions.reduce((latest: any, current: any) => 
    latest.id > current.id ? latest : current
  );
}

export { ContentDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Get DO instance
      const doId = env.CONTENT.idFromName('default');
      const contentDO = env.CONTENT.get(doId);

      // Root path - show HTML
      if (url.pathname === '/') {
        try {
          const latestPublished = await getLatestPublishedVersion(contentDO, url.origin);
          
          if (latestPublished) {
            const contentResponse = await contentDO.fetch(
              new Request(`${url.origin}/content/default/versions/${latestPublished.id}`)
            );
            const contentData = await contentResponse.json();
            
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
            return new Response(getHtmlTemplate('No published content available', 'No published versions', ''), {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        } catch (error) {
          console.error('Root error:', error);
          return new Response(getHtmlTemplate('Error loading content', 'Error occurred', ''), {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }

      // Special handling for /content/default
      if (url.pathname === '/content/default') {
        try {
          const latestPublished = await getLatestPublishedVersion(contentDO, url.origin);
          
          if (latestPublished) {
            const contentResponse = await contentDO.fetch(
              new Request(`${url.origin}/content/default/versions/${latestPublished.id}`)
            );
            const contentData = await contentResponse.json();

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
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }

      // Forward all other requests to DO
      const response = await contentDO.fetch(request);
      
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
        message: error.message 
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