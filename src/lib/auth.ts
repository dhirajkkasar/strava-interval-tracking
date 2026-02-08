import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import StravaProvider from "next-auth/providers/strava";

const DEMO_MODE = process.env.DEMO_MODE === "true";

// Verify credentials are loaded
if (!DEMO_MODE) {
  if (!process.env.STRAVA_CLIENT_ID) {
    console.warn("⚠️  STRAVA_CLIENT_ID is not set");
  }
  if (!process.env.STRAVA_CLIENT_SECRET) {
    console.warn("⚠️  STRAVA_CLIENT_SECRET is not set");
  }
  console.log("🔐 Auth Mode: Strava OAuth");
  console.log(`📋 Client ID: ${process.env.STRAVA_CLIENT_ID?.substring(0, 4)}...`);
} else {
  console.log("🎭 Auth Mode: Demo Mode");
}

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
  
  // Add debug logging
  logger: {
    error: (code, metadata) => {
      console.error(`[NextAuth][${code}]`, JSON.stringify(metadata, null, 2));
    },
    warn: (code) => console.warn(`[NextAuth][${code}]`),
    debug: (code, metadata) => console.log(`[NextAuth][${code}]`, metadata),
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 604800,
  },
  callbacks: {
    async jwt({ token, account, user }: any) {
      console.log("🔵 JWT Callback triggered:", {
        hasUser: !!user,
        hasAccount: !!account,
        hasExistingToken: !!token,
      });

      // Handle initial sign-in with user
      if (user) {
        console.log("✅ JWT Callback - User signed in:", {
          userId: user.id,
          userEmail: user.email,
        });
        if (DEMO_MODE) {
          token.access_token = "demo-token";
          token.refresh_token = "demo-refresh";
          token.expires_at = Math.floor(Date.now() / 1000) + 604800;
        }
        return token;
      }

      // Handle OAuth account (this is where Strava tokens come in)
      if (account) {
        console.log("✅ JWT Callback - OAuth Account received:", {
          provider: account.provider,
          hasAccessToken: !!account.access_token,
          hasRefreshToken: !!account.refresh_token,
          expiresAt: account.expires_at,
          accessTokenLength: account.access_token?.length || 0,
        });
        
        // Store the tokens from Strava
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.expires_at = account.expires_at;
        token.provider = account.provider;
        
        console.log("✅ Tokens stored in JWT token");
        return token;
      }

      // Handle token refresh for OAuth
      if (!DEMO_MODE && token.expires_at && Date.now() >= (token.expires_at as number) * 1000) {
        console.log("🔄 JWT Callback - Token expired, attempting refresh...");
        try {
          const params = new URLSearchParams();
          params.append("client_id", process.env.STRAVA_CLIENT_ID || "");
          params.append("client_secret", process.env.STRAVA_CLIENT_SECRET || "");
          params.append("refresh_token", (token.refresh_token as string) || "");
          params.append("grant_type", "refresh_token");

          const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });

          const refreshed = await response.json();

          if (!response.ok) {
            console.error("❌ Token refresh failed:", {
              status: response.status,
              error: refreshed.error || refreshed,
            });
            throw refreshed;
          }

          console.log("✅ Token refreshed successfully");
          return {
            ...token,
            access_token: refreshed.access_token,
            expires_at: refreshed.expires_at,
            refresh_token: refreshed.refresh_token ?? token.refresh_token,
          };
        } catch (error) {
          console.error("❌ Token refresh failed:", error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
      }

      // Log token state on every callback
      console.log("📋 JWT Token state:", {
        hasAccessToken: !!token.access_token,
        accessTokenLength: (token.access_token as string)?.length || 0,
        expiresAt: token.expires_at,
        hasError: !!token.error,
      });

      return token;
    },
    async session({ session, token }: any) {
      console.log("📋 Session Callback - Input token:", {
        hasToken: !!token,
        hasError: !!token.error,
        hasAccessToken: !!token.access_token,
        accessTokenLength: (token.access_token as string)?.length || 0,
        tokenProvider: token.provider,
      });

      if (token.error) {
        console.error("❌ Session error - Invalid token:", token.error);
        throw new Error("Session token error");
      }

      if (!token.access_token) {
        console.error("❌ Session error - No access token found in token");
        throw new Error("No access token in session");
      }

      session.accessToken = token.access_token as string;
      console.log("✅ Session created successfully with accessToken");
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as default };
export const auth = handler;
export { authOptions };



