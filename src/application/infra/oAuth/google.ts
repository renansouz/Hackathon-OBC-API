import { fromUnixTime,isBefore } from "date-fns";
import { google } from "googleapis";

import { LoadAccount, UpdateAccount } from "@/slices/account/useCases";

import { GoogleOAuth } from "./protocols";

export class GoogleOAuthService implements GoogleOAuth {
  constructor(
    private readonly loadAccount: LoadAccount,
    private readonly updateAccount: UpdateAccount
  ) {}

  async getGoogleOAuthToken(userId: string) {
    const account = await this.loadAccount({
      fields: {
        createdById: userId,
        provider: "google",
      },
      options: {},
    });

    if (!account) {
      return null;
    }
    
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );

    auth.setCredentials({
      access_token: account?.googleAccessToken,
      refresh_token: account?.googleRefreshToken,
      expiry_date: account?.googleExpiresAt ? account?.googleExpiresAt * 1000 : null,
    });

    if (!account?.expiresAt) {
      return auth;
    }

    const isTokenExpired = isBefore(fromUnixTime(account.googleExpiresAt ?? 0), new Date());

    if (isTokenExpired) {
      const { credentials } = await auth.refreshAccessToken();
      
      const {
        access_token,
        expiry_date,
        id_token,
        refresh_token,
        scope,
        token_type,
      } = credentials;

      const query = {
        fields: {
          createdById: account.createdById,
        },
        options: {},
      };
      
      const data = {
        createdById: account.createdById,
        name: account.name,
        accessToken: access_token || undefined,
        expiresAt: expiry_date ? Math.floor(expiry_date / 1000).toString() : undefined,
        idToken: id_token || undefined,
        refreshToken: refresh_token || undefined,
        scope: scope || undefined,
        tokenType: token_type || undefined,
      };
      
      await this.updateAccount(query, data);
      auth.setCredentials({
        access_token,
        refresh_token,
        expiry_date,
      });
    }

    return auth;
  }
}