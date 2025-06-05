// src/config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NovaChat API',
            version: '1.0.0',
            description: 'API documentation for the NovaChat real-time chat platform (Express.js version)',
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 3000}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                UserResponse: { // Schema برای نمایش کاربر بدون پسورد
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                            example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
                        },
                        username: {
                            type: 'string',
                            example: 'johndoe'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            example: 'johndoe@example.com'
                        },
                        displayName: {
                            type: 'string',
                            example: 'John Doe'
                        },
                        profileImageUrl: {
                            type: 'string',
                            format: 'url',
                            nullable: true,
                            example: 'http://example.com/profile.jpg'
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time'
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                }
            }
        },
    },
    // مسیرهایی که JSDoc کامنت‌های Swagger را در آن‌ها جستجو می‌کند
    apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

function setupSwagger(app) {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log(`Swagger UI available at /api-docs`);
}

module.exports = setupSwagger;