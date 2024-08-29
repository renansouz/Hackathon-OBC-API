import fastifyPassport from "@fastify/passport";
import { FastifyInstance, PassportUser } from "fastify";

import { loginAdapter,signupAdapter } from "./authAdapter";
import { loginPostSchema,signupPostSchema } from "./authSchema";

interface User extends PassportUser {
  accessToken: string;
  refreshToken: string;
  user: any;
}

const googleAuthOptions = {
  scope: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
  ],
  accessType: "offline",
  prompt: "consent",
};

const cookieOptions = { path: "/", domain: ".meetflow.tech", maxAge: 7 * 24 * 60 * 60 }; // 7 dias

export async function auth(fastify: FastifyInstance) {
  fastify.post("/auth/signup", signupPostSchema, signupAdapter());
  fastify.post("/auth/login", loginPostSchema, loginAdapter());
  fastify.get("/auth/google", (request, reply) => {
    const role = (request.query as { role: string }).role;
    (request.session.set as (key: string, value: string) => void)("role", role);
    fastifyPassport.authenticate("google", googleAuthOptions).bind(fastify)(request, reply);
  });
  
  fastify.get("/auth/google/callback", 
    {
      preHandler: [
        fastifyPassport.authenticate("google", googleAuthOptions),
        (request, reply, next,) => {
          next();
        }
      ]
    },
    async (request, reply) => {
      const user = request.user as User;

      // Extract the scope parameter from the URL
      const url = new URL(request.url, "https://api.meetflow.tech/");
      const scopes = url.searchParams.get("scope");

      const decodedScopes = decodeURIComponent(scopes || "").split(" ");
      if (!decodedScopes.includes("https://www.googleapis.com/auth/calendar")) {
        reply.code(400).send({ error: "Você deve permitir o escopo do calendário" });
        return;
      }
      if (user) {
        reply.setCookie("meetFlow.token", user.accessToken, cookieOptions);
        reply.setCookie("meetFlow.refreshToken", user.refreshToken, cookieOptions);
        reply.setCookie("meetFlow.user", JSON.stringify(user.user), cookieOptions);
      }
      if (user.user.role === "client") {
        reply.redirect("https://www.meetflow.tech/dashboard/services");
      } else if (user.user.role === "professional") {
        if (user.user.myScheduleId) {
          reply.redirect("https://www.meetflow.tech/professional/dashboard");
        } else {
          reply.redirect("https://www.meetflow.tech/professional/register/google");
        }
      }
    }
  );
}
