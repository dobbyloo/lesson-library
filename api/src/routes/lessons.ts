import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type pg from 'pg';
import { findLessonByCode } from '../queries/lessons.ts';
import { ErrorResponse, LessonDetail, LessonParams } from '../schemas/lesson.ts';

export const lessonRoutes: FastifyPluginAsyncTypebox<{ pool: pg.Pool }> = async (app, { pool }) => {
  app.get(
    '/lessons/:code',
    {
      schema: {
        summary: 'One lesson with its blocks, materials, and assignments',
        description: 'The code is matched ignoring case.',
        params: LessonParams,
        response: { 200: LessonDetail, 404: ErrorResponse },
      },
    },
    async (request, reply) => {
      const lesson = await findLessonByCode(pool, request.params.code);
      if (!lesson) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No lesson with code "${request.params.code}".`,
        });
      }
      return lesson;
    },
  );
};
