// Phone tests for the web app: real Chrome, phone-sized screen, touch input (including multi-finger gestures).
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "test",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1, // WebGL in software is CPU-heavy; one map at a time keeps gestures smooth
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:4173", // e.g. BASE_URL=http://localhost:8788 to test against `wrangler dev`
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone-size", use: { ...devices["iPhone 14"], browserName: "chromium" } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: "npx serve web -l 4173 --no-clipboard", url: "http://localhost:4173", reuseExistingServer: true },
});
