import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: process.env.APP_NAME || 'Auth Boiler Plate',
      version: '1.0.0',
      description: `API documentation for ${process.env.APP_NAME || 'Auth Boiler Plate'}`,
    },
    servers: [
      {
        url: 'https://seminai-be-v2-661301438659.europe-west1.run.app',
        description: 'Production server',
      },
      {
        url: 'http://localhost:8081',
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'auth_token',
          description: 'JWT stored in HttpOnly cookie auth_token',
        },
      },
      schemas: {
        ProductCategory: {
          type: 'string',
          enum: ['FERTILIZER', 'PESTICIDE', 'SEED', 'HARVEST', 'EQUIPMENT', 'PACKAGING', 'OTHER'],
        },
      },
    },
  },
  apis: ['./src/infrastructure/http/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
