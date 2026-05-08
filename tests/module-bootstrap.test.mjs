import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("module manifest advertises v13/v14 compatibility and loads contact model first", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));

  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "14");
  assert.deepEqual(manifest.scripts, [
    "scripts/contact-model.js",
    "scripts/module.js"
  ]);
});

test("module bootstrap registers hidden world contacts setting during init", async () => {
  const registeredHooks = new Map();
  const registeredSettings = [];

  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class ApplicationV2 {},
        DialogV2: class DialogV2 {},
        HandlebarsApplicationMixin: (base) => base
      }
    }
  };
  globalThis.game = {
    settings: {
      register: (...args) => registeredSettings.push(args)
    }
  };
  globalThis.Hooks = {
    once: (hookName, callback) => registeredHooks.set(hookName, callback)
  };
  delete globalThis.CommlinkCaller;

  await import(`../scripts/module.js?test=${Date.now()}`);

  assert.equal(typeof globalThis.CommlinkCaller, "object");
  assert.equal(registeredHooks.has("init"), true);
  assert.equal(registeredHooks.has("ready"), false);

  registeredHooks.get("init")();

  assert.deepEqual(registeredSettings, [[
    "foundry-commlink-caller",
    "contacts",
    {
      name: "Commlink contacts",
      hint: "Stored contacts available to GMs for commlink calls.",
      scope: "world",
      config: false,
      type: Array,
      default: []
    }
  ]]);
});
