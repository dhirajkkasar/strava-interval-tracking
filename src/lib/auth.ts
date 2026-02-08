import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import StravaProvider from "next-auth/providers/strava";

const DEMO_MODE = process.env.DEMO_MODE === "true";

const authOptions: NextAuthOptions = {
  providers: DEMO_MODE
    ? [
        CredentialsProvider({
          id: "demo",
          name: "Demo Mode",
          credentials: {
            demo: { label: "Demo", type: "text", placeholder: "demo" },
          },
          async authorize(credentials) {
            // In demo mode, always authorize
            if (credentials?.demo === "true" || true) {
              return {
                id: "demo-athlete",
                name: "Demo Athlete",
                email: "demo@example.com",
              };
            }
            return null;
          },
        }),
      ]
    : [
        StravaProvider({
          clientId: process.env.STRAVA_CLIENT_ID || "",
          clientSecret: process.env.STRAVA_CLIENT_SECRET || "",
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
  session: {
    strategy: "jwt",
    maxAge: 604800,
  },
  callbacks: {
    async jwt({ token, account, user }: any) {
      // Handle initial sign-in
      if (user) {
        if (DEMO_MODE) {
          token.access_token = "demo-token";
          token.refresh_token = "demo-refresh";
          token.expires_at = Math.floor(Date.now() / 1000) + 604800;
        }
        return token;
      }

      // Handle OAuth account
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at;
        return token;
      }

      // Handle token refresh for OAuth
      if (!DEMO_MODE && token.expires_at && Date.now() >= (token.expires_at as number) * 1000) {
        try {
          const params = new URLSearchParams();
          params.append("client_id", process.env.STRAVA_CLIENT_ID || "");
          params.append("client_secret", process.env.STRAVA_CLIENT_SECRET || "");
          params.append("refresh_token", (token.refresh_token as string) || "");
          params.append("grant_type", "refresh_token");

          const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
            method: "POST",
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
      if (token.error) {
        throw new Error("Session token error");
      }
      session.accessToken = token.access_token as string;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as default };
export const auth = handler;
export { authOptions };



