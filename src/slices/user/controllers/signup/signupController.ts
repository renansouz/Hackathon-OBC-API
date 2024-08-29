/* eslint-disable no-unsafe-optional-chaining */
import { EmailInUseError } from "@/application/errors";
import {
  addDays,
  Authentication,
  badRequest,
  forbidden,
  HttpRequest,
  HttpResponse,
  success,
  unauthorized,
  Validation,
} from "@/application/helpers";
import { Controller } from "@/application/infra/contracts";
import { GoogleOAuthService } from "@/application/infra/oAuth";
import { AddAccount } from "@/slices/account/useCases";
import { AddUser, LoadUser } from "@/slices/user/useCases";

import { UserEntity } from "../../entities";

interface AuthResponse {
  user : UserEntity;
  accessToken: string;
  refreshToken: string;
}

export class SignupController extends Controller {
  constructor(
    private readonly validation: Validation,
    private readonly addUser: AddUser,
    private readonly loadUser: LoadUser,
    private readonly authentication: Authentication,
    private readonly addAccount: AddAccount,
    private readonly googleOAuthService: GoogleOAuthService
  ) {
    super();
  }
  async execute(httpRequest: HttpRequest<any>): Promise<HttpResponse<AuthResponse | any>> {
    const errors = this.validation.validate(httpRequest?.body);
    if (errors?.length > 0) {
      return badRequest(errors);
    }
    const { email, password } = httpRequest?.body;
    const userExists = await this.loadUser({
      fields: { email },
      options: { projection: { password: 0 } },
    });
    if (userExists) {
      return forbidden(new EmailInUseError());
    }
    delete httpRequest?.body?.passwordConfirmation;
    const userCreated = await this.addUser(httpRequest?.body);
    const { accessToken = null, refreshToken = null } =
      (await this.authentication.auth(email, password)) || {};
    if (!accessToken || !refreshToken) {
      return unauthorized();
    }

    if (httpRequest?.body?.provider === "google") {
      console.log("provider google", httpRequest?.body?.provider );
      const auth = await this.googleOAuthService.getGoogleOAuthToken(userCreated?._id as string);
      if(auth) {
        console.log("auth Controller", auth);
        const { access_token, refresh_token } = auth.credentials;
        await this.addAccount({
          createdById: userCreated?._id as string,
          name: userCreated?.name as string,
          refreshToken,
          active: true,
          expiresAt: addDays(new Date(), 1) as unknown as string,
        });
        return success({ user: userCreated, accessToken: access_token, refreshToken:refresh_token });
      }
    }
    
    await this.addAccount({
      createdById: userCreated?._id as string,
      name: userCreated?.name as string,
      refreshToken,
      active: true,
      expiresAt: addDays(new Date(), 1) as unknown as string,
    });
    return success({ user: userCreated, accessToken, refreshToken });
  }
}
