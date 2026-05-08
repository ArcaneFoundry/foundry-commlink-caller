import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import "../scripts/contact-model.js";

const contactModel = globalThis.CommlinkCaller.contactModel;

test("module manifest advertises v13/v14 compatibility and loads contact model first", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));

  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "14");
  assert.deepEqual(manifest.scripts, [
    "scripts/contact-model.js",
    "scripts/module.js"
  ]);
});

test("module bootstrap registers hidden world contacts setting and GM menu during init", async () => {
  const registeredHooks = new Map();
  const registeredSettings = [];
  const registeredMenus = [];

  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class ApplicationV2 {
          constructor() {
            this.renderCount = 0;
          }

          render(options) {
            this.renderCount += 1;
            this.renderOptions = options;
          }
        },
        DialogV2: class DialogV2 {},
        HandlebarsApplicationMixin: (base) => base
      }
    }
  };
  globalThis.game = {
    settings: {
      register: (...args) => registeredSettings.push(args),
      registerMenu: (...args) => registeredMenus.push(args)
    }
  };
  globalThis.Hooks = {
    once: (hookName, callback) => registeredHooks.set(hookName, callback)
  };
  globalThis.CommlinkCaller = { contactModel };

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
  assert.equal(registeredMenus.length, 1);
  assert.equal(registeredMenus[0][0], "foundry-commlink-caller");
  assert.equal(registeredMenus[0][1], "contactManager");
  assert.equal(registeredMenus[0][2].name, "Commlink contacts");
  assert.equal(registeredMenus[0][2].restricted, true);
  assert.equal(registeredMenus[0][2].type, globalThis.CommlinkCaller.ContactManager);
  assert.equal(globalThis.CommlinkCaller.TEMPLATES.manager, "modules/foundry-commlink-caller/templates/contact-manager.hbs");
  assert.equal(globalThis.CommlinkCaller.ContactManager.DEFAULT_OPTIONS.id, "commlink-caller-contact-manager");
  assert.deepEqual(globalThis.CommlinkCaller.ContactManager.PARTS, {
    manager: {
      template: "modules/foundry-commlink-caller/templates/contact-manager.hbs"
    }
  });
});

test("contact helpers read and persist normalized contacts through Foundry settings", async () => {
  const savedSettings = [];

  globalThis.game = {
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        assert.equal(setting, "contacts");

        return [
          { id: " alpha ", name: " Alpha ", volume: 2 },
          { name: " " }
        ];
      },
      set: async (...args) => {
        savedSettings.push(args);
      }
    }
  };

  assert.deepEqual(globalThis.CommlinkCaller.getContacts(), [{
    id: "alpha",
    name: "Alpha",
    handle: "",
    portrait: "",
    ringtone: "",
    message: "Incoming call",
    volume: 1
  }]);

  await globalThis.CommlinkCaller.setContacts([
    { id: " beta ", name: " Beta ", volume: -1 },
    { name: "" }
  ]);

  assert.deepEqual(savedSettings, [[
    "foundry-commlink-caller",
    "contacts",
    [{
      id: "beta",
      name: "Beta",
      handle: "",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 0
    }]
  ]]);
});

test("contact manager context renders normalized contacts and selected editor contact", async () => {
  globalThis.game = {
    settings: {
      get: () => [
        {
          id: "ace",
          name: "Ace",
          handle: "channel-1",
          portrait: "",
          ringtone: "",
          message: "Ready?",
          volume: 0.5
        }
      ]
    }
  };

  const manager = new globalThis.CommlinkCaller.ContactManager();

  assert.deepEqual(await manager._prepareContext(), {
    contacts: [{
      id: "ace",
      name: "Ace",
      handle: "channel-1",
      portrait: "",
      ringtone: "",
      message: "Ready?",
      volume: 0.5
    }],
    editorContact: null,
    isEditing: false
  });

  manager._editContact({
    preventDefault: () => {},
    currentTarget: { dataset: { contactId: "ace" } }
  });

  assert.equal(manager.renderCount, 1);
  assert.deepEqual(manager.renderOptions, { force: true });
  assert.deepEqual(await manager._prepareContext(), {
    contacts: [{
      id: "ace",
      name: "Ace",
      handle: "channel-1",
      portrait: "",
      ringtone: "",
      message: "Ready?",
      volume: 0.5
    }],
    editorContact: {
      id: "ace",
      name: "Ace",
      handle: "channel-1",
      portrait: "",
      ringtone: "",
      message: "Ready?",
      volume: 0.5
    },
    isEditing: true
  });
});
