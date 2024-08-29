import fastifyPassport from "@fastify/passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { env } from "@/application/infra";
import {  makeLoadUserFactory } from "@/slices/user/useCases";

import { handleGoogleProfile } from "../googleProfileHandler";

fastifyPassport.use(new GoogleStrategy({
  clientID: env.googleClientId,
  clientSecret: env.googleClientSecret,
  callbackURL: "https://api.meetflow.tech/api/auth/google/callback",
  passReqToCallback: true,
},
async (request: any, accessToken: string, refreshToken: string, params: any ,profile: any, done: any) => {
  const expiresIn = params.expires_in;

  const role = request.session.get("role"); // Get role from session
  console.log("role",role);

  try {
    const user = await handleGoogleProfile(profile, accessToken, refreshToken, expiresIn, role);
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
}
)
);

fastifyPassport.registerUserSerializer(async (user: any) => {
  return user.user._id; 
});

fastifyPassport.registerUserDeserializer(async (id) => {
  const loadUser = makeLoadUserFactory();
  const user = await loadUser({
    fields: { _id: id },
    options: {},
  });
  return user;
});