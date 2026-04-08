import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { aiRouter } from "./ai-router";
import { familyRouter } from "./family-router";
import { deleteUserByOpenId } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    deleteAccount: publicProcedure.mutation(async ({ ctx }) => {
      const user = ctx.user;
      if (user?.openId) {
        try {
          await deleteUserByOpenId(user.openId);
        } catch (e) {
          console.error('[deleteAccount] Failed to delete user from DB:', e);
        }
      }
      // Clear session cookie regardless
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ai: aiRouter,
  smart: aiRouter,
  family: familyRouter,  // <-- NEW: Family cloud sync routes
});

export type AppRouter = typeof appRouter;
