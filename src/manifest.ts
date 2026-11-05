import { Type } from "@sinclair/typebox";
import { defineManifest } from "@absolutejs/manifest";
export const manifest = defineManifest()({
  contract: 2,
  identity: {
    name: "@absolutejs/job-sources",
    category: "data",
    accent: "#6554ce",
    docsUrl: "https://github.com/absolutejs/job-sources",
    tagline: "Published career listings with explicit source provenance.",
    description:
      "Greenhouse, Lever and Ashby public board adapters. Host-owned egress, bounded pagination, cancellation, source timestamps and explicit partial/failure outcomes. No candidate matching or application submission.",
  },
  integration: { mode: "code-first" },
  wiring: [],
  settings: Type.Object({}),
});
