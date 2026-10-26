const skipInstall =
  process.env.HUSKY === "0" ||
  process.env.NODE_ENV === "production" ||
  process.env.CI === "true";

if (!skipInstall) {
  const { default: installHusky } = await import("husky");

  // Preserve your existing repository-root .husky location.
  process.chdir("..");
  console.log(installHusky(".husky"));
}
