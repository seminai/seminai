import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Seminai Extraction API',
      version: '1.0.0',
      description:
        'Public B2B API for extracting structured data from Italian invoices and delivery notes (DDT).',
    },
    servers: [
      {
        url: 'http://localhost:8081',
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
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'API key for document extraction (sk_live_...)',
        },
      },
    },
  },
  apis: ['./src/infrastructure/http/routes/extraction-api.routes.ts'],
};

export const swaggerExtractApiSpec = swaggerJsdoc(options);
