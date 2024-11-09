import { ContentDO } from './contentDO';

interface Env {
  CONTENT: DurableObjectNamespace;
}

export { ContentDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);
      
      console.log('Request path:', url.pathname);
      console.log('Parts:', parts);

      // Khởi tạo Durable Object
      const id = env.CONTENT.idFromName('default');
      const contentDO = env.CONTENT.get(id);

      // Forward tất cả requests đến Durable Object
      const response = await contentDO.fetch(request);
      return response;

    } catch (err) {
      const error = err as Error;
      console.error('Error:', error);
      return new Response(error.message, { status: 500 });
    }
  }
};