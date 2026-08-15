export const buildInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA ?? "local",
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(),
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "",
};
