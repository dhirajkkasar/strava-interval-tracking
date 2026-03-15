import NextAuth, { type NextAuthOptions } from "next-auth";
import StravaProvider from "next-auth/providers/strava";

const STRAVA_CLIENT_ID = (process.env.STRAVA_CLIENT_ID || "").trim();
const STRAVA_CLIENT_SECRET = (process.env.STRAVA_CLIENT_SECRET || "").trim();

if (!STRAVA_CLIENT_ID) console.warn("⚠️  STRAVA_CLIENT_ID is not set");
if (!STRAVA_CLIENT_SECRET) console.warn("⚠️  STRAVA_CLIENT_SECRET is not set");

const authOptions: NextAuthOptions = {
  providers: [
    StravaProvider({
      clientId: STRAVA_CLIENT_ID,
      clientSecret: STRAVA_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "activity:read_all",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  cookies: {
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
      },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
      },
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 604800,
  },
  callbacks: {
    async jwt({ token, account }: any) {
      if (account) {
        console.log("🔵 JWT: OAuth account received, storing tokens");
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at;
        return token;
      }

      // Refresh expired token
      if (token.expires_at && Date.now() >= (token.expires_at as number) * 1000) {
        console.log("🔄 JWT: Token expired, refreshing...");
        try {
          const params = new URLSearchParams({
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            refresh_token: token.refresh_token as string,
            grant_type: "refresh_token",
          });

          const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });

          const refreshed = await response.json();
          if (!response.ok) throw refreshed;

          return {
            ...token,
            access_token: refreshed.access_token,
            expires_at: refreshed.expires_at,
            refresh_token: refreshed.refresh_token ?? token.refresh_token,
          };
        } catch (error) {
          console.error("Token refresh failed:", error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
      }

      return token;
    },
    async session({ session, token }: any) {
      console.log("📋 Session: hasAccessToken=%s, hasError=%s", !!token.access_token, !!token.error);
      if (token.error) throw new Error("Session token error");
      if (!token.access_token) throw new Error("No access token in session");
      session.accessToken = token.access_token as string;
      return session;
    },
  },
  logger: {
    error: (code, metadata) => console.error(`[NextAuth][${code}]`, JSON.stringify(metadata, null, 2)),
    warn: (code) => console.warn(`[NextAuth][${code}]`),
    debug: (code, metadata) => console.log(`[NextAuth][${code}]`, metadata),
  },
};

const handler = NextAuth(authOptions);
export { handler as default };
export const auth = handler;
export { authOptions };
