import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type pg from 'pg';
import { lessonRoutes } from './routes/lessons.ts';

// Builds the Fastify app without starting it, so tests can hand it their own database
// pool and call it with app.inject().
export function buildApp(options: { pool: pg.Pool; logger?: boolean }) {
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<TypeBoxTypeProvider>();

  // Collects every route's schema into one OpenAPI document. Registered before the routes
  // so that it sees them.
  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Lesson Library API', version: '1' },
    },
  });

  app.register(
    async (v1) => {
      v1.register(lessonRoutes, { pool: options.pool });
      v1.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
    },
    { prefix: '/api/v1' },
  );

  return app;
}
