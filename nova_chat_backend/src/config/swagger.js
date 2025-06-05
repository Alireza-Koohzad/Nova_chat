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
                },
                MessageResponse: {
                    type: 'object',
                    properties: {
                        id: {type: 'string', format: 'uuid'},
                        chatId: {type: 'string', format: 'uuid'},
                        senderId: {type: 'string', format: 'uuid'},
                        content: {type: 'string'},
                        contentType: {type: 'string', enum: ['text', 'image', 'video', 'file', 'system']},
                        fileUrl: {type: 'string', format: 'url', nullable: true},
                        createdAt: {type: 'string', format: 'date-time'},
                        updatedAt: {type: 'string', format: 'date-time'},
                        sender: { // اطلاعات فرستنده
                            type: 'object',
                            properties: {
                                id: {type: 'string', format: 'uuid'},
                                username: {type: 'string'},
                                displayName: {type: 'string'},
                                profileImageUrl: {type: 'string', format: 'url', nullable: true}
                            }
                        }
                    }
                },
                ChatMemberResponse: { // اطلاعات یک عضو چت
                    type: 'object',
                    properties: {
                        id: {type: 'string', format: 'uuid'},
                        username: {type: 'string'},
                        displayName: {type: 'string'},
                        profileImageUrl: {type: 'string', format: 'url', nullable: true},
                        // role: { type: 'string', enum: ['member', 'admin'], description: "Role in group chats" }
                    }
                },
                ChatResponse: { // برای لیست چت‌ها
                    type: 'object',
                    properties: {
                        id: {type: 'string', format: 'uuid'},
                        type: {type: 'string', enum: ['private', 'group']},
                        name: {
                            type: 'string',
                            nullable: true,
                            description: "Chat name (for groups, or recipient's name for private chats)"
                        },
                        profileImageUrl: {
                            type: 'string',
                            format: 'url',
                            nullable: true,
                            description: "Group image or recipient's profile image"
                        },
                        creatorId: {type: 'string', format: 'uuid', nullable: true},
                        lastMessage: {
                            "$ref": "#/components/schemas/MessageResponse",
                            nullable: true
                        },
                        // members: { // نمایش ساده اعضا برای لیست چت‌ها
                        //     type: 'array',
                        //     items: { "$ref": "#/components/schemas/ChatMemberResponse" }
                        // },
                        recipientId: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                            description: "ID of the other user in a private chat"
                        },
                        createdAt: {type: 'string', format: 'date-time'},
                        updatedAt: {type: 'string', format: 'date-time'},
                    }
                },
                ChatDetailResponse: { // برای نمایش جزئیات یک چت خاص
                    allOf: [ // ارث‌بری از ChatResponse
                        {"$ref": "#/components/schemas/ChatResponse"},
                        {
                            type: 'object',
                            properties: {
                                members: { // اطلاعات کامل‌تر اعضا
                                    type: 'array',
                                    items: {"$ref": "#/components/schemas/ChatMemberResponse"}
                                }
                            }
                        }
                    ]
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