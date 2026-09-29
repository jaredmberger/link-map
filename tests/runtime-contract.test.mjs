import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../functions/api/runtime.js";

test("Link Map runtime endpoint exposes contract v1", async () => {
  const response = await onRequestGet({
    env: {
      CF_PAGES_COMMIT_SHA: "abcdef1234567890",
      CF_PAGES_BRANCH: "main",
      CF_PAGES_URL: "https://example.pages.dev"
    }
  });
  const body = await response.json();
  assert.equal(body.contractVersion, 1);
  assert.equal(body.service, "Link Map");
  assert.equal(body.repository, "jaredmberger/link-map");
  assert.equal(body.productionBranch, "main");
  assert.equal(body.version, "1.0.0");
  assert.equal(body.commit, "abcdef1234567890");
  assert.equal(body.cloudflareDeploymentId, null);
  assert.equal(body.runtime, "cloudflare-pages");
  assert.equal(body.build.source, "cloudflare-pages");
});
