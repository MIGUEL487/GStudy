import { chromium } from "playwright";

export const qaUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Ana Silva" },
  created_at: "2026-10-23T12:00:00Z",
};
/** Browser-only fixtures: authentication still goes through the app's ordinary Supabase client. */
export async function qaContext(browser, { width = 390, theme = "dark" } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ user, theme }) => {
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(
          JSON.stringify({
            sub: user.id,
            aud: "authenticated",
            role: "authenticated",
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
        ) +
        ".qa";
      localStorage.setItem(
        "sb-gstudy-test-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "qa-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      );
      localStorage.setItem("gstudy_theme", theme);
    },
    { user: qaUser, theme },
  );
  await context.route("https://gstudy-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname === "/auth/v1/user") data = qaUser;
    else if (url.pathname.endsWith("/profiles"))
      data = url.searchParams.get("id")?.startsWith("eq.")
        ? {
            id: qaUser.id,
            username: "ana_silva",
            display_name: "Ana Silva",
            onboarding_completed: true,
            school_year: "medio-2",
            year_selected_at: "2026-10-23T12:00:00Z",
          }
        : [];
    else if (url.pathname.endsWith("/get_learning_hearts"))
      data = {
        hearts: 3,
        max: 3,
        regen_minutes: 120,
        server_now: new Date().toISOString(),
        next_at: null,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return context;
}
export function launchQaBrowser() {
  return chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
}
