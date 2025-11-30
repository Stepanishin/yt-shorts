import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { getUserByGoogleId, upsertUserByGoogleId } from "./db/users";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  trustHost: true, // Разрешаем любой хост в production (DigitalOcean, Vercel, etc.)
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        try {
          // Сохраняем или обновляем пользователя в базе данных
          const dbUser = await upsertUserByGoogleId(profile.sub, {
            email: user.email!,
            name: user.name!,
            image: user.image || undefined,
          });

          return true;
        } catch (error) {
          console.error("Error saving user to database:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // При первом входе добавляем googleId в токен
      if (account && profile?.sub) {
        token.googleId = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      // Добавляем googleId в сессию
      if (token.googleId && session.user) {
        session.user.id = token.googleId as string;

        // Загружаем актуальные данные пользователя из базы
        try {
          const dbUser = await getUserByGoogleId(token.googleId as string);
          if (dbUser) {
            session.user.email = dbUser.email;
            session.user.name = dbUser.name;
            session.user.image = dbUser.image;
            session.user.credits = dbUser.credits || 0;
            session.user.isAdmin = dbUser.isAdmin || false;
          }
        } catch (error) {
          console.error("Error loading user from database:", error);
        }
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
