/* eslint-disable @typescript-eslint/no-var-requires */
import "./application/infra/config/module-alias";

import cors from "@fastify/cors";
import fastifyPassport from "@fastify/passport";
import fastifySecureSession from "@fastify/secure-session";
import Fastify, { FastifyInstance } from "fastify";
import multer from "fastify-multer";

import { env, MongoHelper,routes } from "@/application/infra";
const { fastifyRequestContextPlugin } = require("@fastify/request-context");


export const makeFastifyInstance = async (externalMongoClient = null) => {
  const fastify: FastifyInstance = Fastify({ logger: true });
  try {
    const client = externalMongoClient ?? (await MongoHelper.connect(env.mongoUri));

    await fastify.register(multer.contentParser),{
      limits: {
        fieldSize: 1024 * 1024 * 5,
        fileSize: 1024 * 1024 * 5, // 5MB 
        files: 1, // 1 file per request
      },
    };

    await fastify.register(fastifySecureSession, {
      key: env.oAuthSecret,
      cookieName: "session",
      cookie: {
        path: "/",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: env.environment === "production",
      },
    });

    await fastify.register(fastifyPassport.initialize());
    await fastify.register(fastifyPassport.secureSession());

    await fastify.register(require("@fastify/helmet"), {
      contentSecurityPolicy: false,
      global: true,
    });
    await fastify.register(require("@fastify/rate-limit"), {
      max: 100,
      timeWindow: "5 minute",
    });
    await fastify.register(cors, {
      // Como coloco o localhost na origin abaixo 
      origin: ["https://www.meetflow.tech", "http://localhost:4173", "http://localhost:5173"], // Altere para a sua origem exata
      methods: ["POST", "GET", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "authorization", "refreshtoken"],
      credentials: true, // Permitir cookies
    });
    // if (env.environment === "production") {
    //   await fastify.register(require("@fastify/under-pressure"), {
    //     maxEventLoopDelay: 1000,
    //     maxHeapUsedBytes: 100000000,
    //     maxRssBytes: 100000000,
    //     maxEventLoopUtilization: 0.98,
    //     message: "Estamos sobrecarregados!",
    //     retryAfter: 50,
    //   });
    // }

    await fastify.register(fastifyRequestContextPlugin, {
      hook: "onRequest",
      defaultStoreValues: {
        user: { insertedId: "system" },
      },
    });
        
    await fastify.register(require("@fastify/mongodb"), {
      forceClose: true,
      client,
    });

    for (const route of routes) { // Percorrendo todas as rotas
      fastify.register(route, { prefix: "/api" });
    }
    return fastify;
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};
// Run the server!
const start = async () => {
  const fastifyInstance = await makeFastifyInstance();
  if (!fastifyInstance) return;
  const port: any = env?.port ?? 3000;
  await fastifyInstance.listen({ port, host: "0.0.0.0" });
  fastifyInstance.log.info(`server listening on ${port}`);
};
if (env.environment === "production") {
  start();
}