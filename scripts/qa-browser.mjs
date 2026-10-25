import { chromium, devices } from "playwright";

export const qaUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Ana Silva" },
  created_at: "2026-10-23T12:00:00Z",
};
/** Browser-only fixtures: authentication still goes through the app's ordinary Supabase client. */
export async function qaContext(
  browser,
  { width = 390, theme = "dark", user = qaUser, ...options } = {},
) {
  const context = await browser.newContext({
    ...(process.env.QA_DEVICE ? devices[process.env.QA_DEVICE] : {}),
    viewport: { width, height: width < 768 ? 844 : 900 },
    reducedMotion: process.env.QA_REDUCED_MOTION || "reduce",
    ...(process.env.QA_ANIMATION === "1"
      ? {
          recordVideo: {
            dir: process.env.QA_ANIMATION_OUTPUT + "/videos",
            size: { width: Math.min(width, 1440), height: 900 },
          },
        }
      : {}),
    ...options,
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
    { user, theme },
  );
  await context.route("https://gstudy-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname.endsWith("/profiles"))
      data = url.searchParams.get("id")?.startsWith("eq.")
        ? {
            id: user.id,
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
  const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002";
  await context.route(`${base}/_serverFn/**`, (route) =>
    route.fulfill({ status: 503, body: "Função não incluída na simulação local." }),
  );
  if (process.env.QA_ANIMATION === "1") {
    const { instrumentAnimations } = await import("./qa-animation.mjs");
    await instrumentAnimations(context, {
      output: process.env.QA_ANIMATION_OUTPUT,
      mobile: width < 768,
    });
  }
  return context;
}
export function launchQaBrowser() {
  return chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
}
