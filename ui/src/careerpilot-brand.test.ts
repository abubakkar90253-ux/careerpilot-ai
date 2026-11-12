// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiRoot = new URL("../", import.meta.url);
const readUiFile = (path: string) => readFileSync(fileURLToPath(new URL(path, uiRoot)), "utf8");

describe("CareerPilot AI application branding", () => {
  it("uses the CareerPilot name and icon in the browser shell", () => {
    const html = readUiFile("index.html");
    expect(html).toContain("<title>CareerPilot AI</title>");
    expect(html).toContain('name="apple-mobile-web-app-title" content="CareerPilot AI"');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).not.toContain('href="/favicon.ico"');
  });

  it("exposes CareerPilot branding in the install manifest", () => {
    const manifest = JSON.parse(readUiFile("public/site.webmanifest")) as {
      name: string;
      short_name: string;
      icons: Array<{ src: string; type: string }>;
    };
    expect(manifest.name).toBe("CareerPilot AI");
    expect(manifest.short_name).toBe("CareerPilot");
    expect(manifest.icons).toContainEqual({ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" });
  });
});
