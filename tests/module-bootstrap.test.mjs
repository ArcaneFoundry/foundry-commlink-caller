import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { test } from "node:test";

import "../scripts/contact-model.js";

const contactModel = globalThis.CommlinkCaller.contactModel;

test("module manifest advertises v13/v14 compatibility and loads contact model first", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "foundry-commlink-caller");
  assert.equal(manifest.version, "1.0.2");
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "14");
  assert.equal(manifest.compatibility.maximum, "14");
  assert.equal(manifest.license, "LICENSE");
  assert.equal(manifest.readme, "README.md");
  assert.equal(manifest.changelog, "CHANGELOG.md");
  assert.equal(manifest.bugs, "https://github.com/ArcaneFoundry/foundry-commlink-caller/issues");
  assert.equal(manifest.socket, true);
  assert.equal(manifest.manifest, "https://github.com/ArcaneFoundry/foundry-commlink-caller/releases/latest/download/module.json");
  assert.equal(manifest.download, "https://github.com/ArcaneFoundry/foundry-commlink-caller/releases/download/v1.0.2/foundry-commlink-caller-v1.0.2.zip");
  assert.deepEqual(manifest.scripts, [
    "scripts/contact-model.js",
    "scripts/module.js"
  ]);
  assert.equal(packageJson.name, "foundry-commlink-caller");
  assert.equal(packageJson.version, "1.0.2");
  assert.equal(packageJson.license, "MIT");
});

test("module bootstrap registers settings and GM menu during init", async () => {
  const registeredHooks = new Map();
  const registeredPersistentHooks = new Map();
  const registeredSettings = [];
  const registeredMenus = [];
  const socketHandlers = [];

  globalThis.foundry = {
    applications: {
      instances: new Map(),
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
      },
      apps: {
        FilePicker: {
          fromButton: () => ({ render: () => {} })
        }
      }
    },
    utils: {
      randomID: () => "call-id"
    }
  };
  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
    socket: {
      on: (...args) => socketHandlers.push(args)
    },
    settings: {
      get: () => true,
      register: (...args) => registeredSettings.push(args),
      registerMenu: (...args) => registeredMenus.push(args)
    }
  };
  globalThis.Hooks = {
    once: (hookName, callback) => registeredHooks.set(hookName, callback),
    on: (hookName, callback) => registeredPersistentHooks.set(hookName, callback)
  };
  globalThis.CommlinkCaller = { contactModel };

  await import(`../scripts/module.js?test=${Date.now()}`);

  assert.equal(typeof globalThis.CommlinkCaller, "object");
  assert.equal(registeredHooks.has("init"), true);
  assert.equal(registeredHooks.has("ready"), true);
  assert.equal(registeredPersistentHooks.has("getSceneControlButtons"), true);

  registeredHooks.get("init")();

  assert.deepEqual(registeredSettings, [
    [
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
    ],
    [
      "foundry-commlink-caller",
      "contactTargetSelections",
      {
        name: "Commlink call targets",
        hint: "Stored selected call recipients for the Commlink contacts window.",
        scope: "world",
        config: false,
        type: Object,
        default: {}
      }
    ],
    [
      "foundry-commlink-caller",
      "showWelcome",
      {
        name: "Show welcome screen",
        hint: "Show the Commlink Caller welcome tutorial for this user. GMs only; players never receive the welcome screen.",
        scope: "user",
        config: true,
        type: Boolean,
        default: true,
        onChange: registeredSettings[2][2].onChange
      }
    ],
    [
      "foundry-commlink-caller",
      "showSceneControlButton",
      {
        name: "Show GM scene-control button",
        hint: "Show the Commlink contacts shortcut in the Token scene controls for GMs.",
        scope: "user",
        config: true,
        type: Boolean,
        default: true
      }
    ],
    [
      "foundry-commlink-caller",
      "preferredRingtone",
      {
        name: "Preferred ringtone",
        hint: "Choose the ringtone that plays when your commlink receives a call.",
        scope: "user",
        config: true,
        type: String,
        choices: registeredSettings[4][2].choices,
        default: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-1.ogg"
      }
    ],
    [
      "foundry-commlink-caller",
      "preferredPhoneFrame",
      {
        name: "Preferred phone frame",
        hint: "Choose the commlink frame style shown when you receive a call.",
        scope: "user",
        config: true,
        type: String,
        choices: registeredSettings[5][2].choices,
        default: "cyberpunk"
      }
    ]
  ]);
  assert.equal(registeredSettings[4][2].choices["modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-1.ogg"], "Ringtone 1");
  assert.equal(registeredSettings[4][2].choices["modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-18.ogg"], "Ringtone 18");
  assert.equal(registeredSettings[5][2].choices.none, "No phone frame");
  assert.equal(registeredSettings[5][2].choices.cyberpunk, "Cyberpunk neon");
  assert.equal(registeredSettings[5][2].choices.retro, "1950s bakelite");
  assert.equal(registeredMenus.length, 1);
  assert.equal(registeredMenus[0][0], "foundry-commlink-caller");
  assert.equal(registeredMenus[0][1], "contactManager");
  assert.equal(registeredMenus[0][2].name, "Commlink contacts");
  assert.equal(registeredMenus[0][2].restricted, true);
  assert.equal(registeredMenus[0][2].type, globalThis.CommlinkCaller.ContactManager);
  assert.equal(globalThis.CommlinkCaller.TEMPLATES.manager, "modules/foundry-commlink-caller/templates/contact-manager.hbs");
  assert.equal(globalThis.CommlinkCaller.TEMPLATES.welcome, "modules/foundry-commlink-caller/templates/welcome.hbs");
  assert.equal(globalThis.CommlinkCaller.RINGTONE_PRESETS.length, 18);
  assert.equal(globalThis.CommlinkCaller.PHONE_FRAME_OPTIONS.length, 5);
  assert.equal(globalThis.CommlinkCaller.ContactManager.DEFAULT_OPTIONS.id, "commlink-caller-contact-manager");
  assert.equal(globalThis.CommlinkCaller.ContactManager.DEFAULT_OPTIONS.window.title, "Commlink");
  assert.deepEqual(globalThis.CommlinkCaller.ContactManager.DEFAULT_OPTIONS.position, {
    width: 620,
    height: 640
  });
  assert.deepEqual(globalThis.CommlinkCaller.ContactManager.PARTS, {
    manager: {
      template: "modules/foundry-commlink-caller/templates/contact-manager.hbs"
    }
  });

  registeredHooks.get("ready")();

  assert.deepEqual(socketHandlers, [[
    "module.foundry-commlink-caller",
    globalThis.CommlinkCaller.receiveSocketMessage
  ]]);

  const controls = { tokens: { tools: { select: {} } } };
  registeredPersistentHooks.get("getSceneControlButtons")(controls);

  assert.deepEqual(controls.tokens.tools.commlinkCaller, {
    name: "commlinkCaller",
    title: "Commlink contacts",
    icon: "fa-solid fa-satellite-dish",
    order: 1,
    button: true,
    visible: true,
    onChange: controls.tokens.tools.commlinkCaller.onChange
  });

  globalThis.game.settings.get = (moduleId, setting) => {
    assert.equal(moduleId, "foundry-commlink-caller");
    return setting !== "showSceneControlButton";
  };

  const hiddenControls = { tokens: { tools: { select: {} } } };
  registeredPersistentHooks.get("getSceneControlButtons")(hiddenControls);

  assert.equal(hiddenControls.tokens.tools.commlinkCaller.visible, false);

  globalThis.game.user.isGM = false;
  globalThis.game.settings.get = () => true;

  const playerControls = { tokens: { tools: { select: {} } } };
  registeredPersistentHooks.get("getSceneControlButtons")(playerControls);

  assert.equal(playerControls.tokens.tools.commlinkCaller.visible, false);
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
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "other-gm", name: "Other GM", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        if (setting === "contactTargetSelections") return { __global__: ["player", "gm"] };

        return [{
          id: "ace",
          name: "Ace",
          handle: "channel-1",
          portrait: "",
          ringtone: "",
          message: "Ready?",
          volume: 0.5
        }];
      }
    }
  };

  const manager = new globalThis.CommlinkCaller.ContactManager();
  const context = await manager._prepareContext();

  assert.equal(context.contacts[0].id, "ace");
  assert.equal(context.contacts[0].isEditing, false);
  assert.equal("callTargets" in context.contacts[0], false);
  assert.deepEqual(context.callTargets.map((target) => [target.id, target.selected]), [
    ["gm", true],
    ["player", true]
  ]);
  assert.equal(context.allPlayerTargetsSelected, true);
  assert.equal(context.editorContact, null);
  assert.equal(context.isCreating, false);
  assert.equal(context.isEditing, false);
  assert.equal("ringtonePresets" in context, false);

  manager._editContact({
    preventDefault: () => {},
    currentTarget: { dataset: { contactId: "ace" } }
  });

  assert.equal(manager.renderCount, 1);
  assert.deepEqual(manager.renderOptions, { force: true });

  const editingContext = await manager._prepareContext();

  assert.equal(editingContext.contacts[0].isEditing, true);
  assert.equal(editingContext.editorContact.id, "ace");
  assert.equal(editingContext.isCreating, false);
  assert.equal(editingContext.isEditing, true);
});

test("openContactManager is GM-only and reuses the existing window", async () => {
  const warnings = [];
  const existingManager = new globalThis.CommlinkCaller.ContactManager();

  globalThis.foundry.applications.instances = new Map();
  globalThis.ui = {
    notifications: {
      warn: (message) => warnings.push(message)
    }
  };
  globalThis.game = {
    user: { isGM: false }
  };

  assert.equal(globalThis.CommlinkCaller.openContactManager(), null);
  assert.deepEqual(warnings, ["Only GMs can manage commlink contacts."]);

  globalThis.game.user.isGM = true;

  const newManager = globalThis.CommlinkCaller.openContactManager();

  assert.ok(newManager instanceof globalThis.CommlinkCaller.ContactManager);
  assert.equal(newManager.renderCount, 1);
  assert.deepEqual(newManager.renderOptions, { force: true });

  globalThis.foundry.applications.instances.set(
    globalThis.CommlinkCaller.ContactManager.DEFAULT_OPTIONS.id,
    existingManager
  );

  const reusedManager = globalThis.CommlinkCaller.openContactManager();

  assert.equal(reusedManager, existingManager);
  assert.equal(existingManager.renderCount, 1);
  assert.deepEqual(existingManager.renderOptions, { force: true });
});

test("welcome screen opens only for GMs with the setting enabled", async () => {
  const savedSettings = [];
  const originalFormData = globalThis.FormData;
  const existingWelcome = new globalThis.CommlinkCaller.WelcomeScreen();

  globalThis.FormData = class TestFormData {
    constructor(form) {
      this.form = form;
    }

    get(fieldName) {
      return this.form[fieldName] || "";
    }
  };
  globalThis.foundry.applications.instances = new Map();
  globalThis.game = {
    user: { isGM: false },
    settings: {
      get: () => false,
      set: async (...args) => savedSettings.push(args)
    }
  };

  try {
    assert.equal(globalThis.CommlinkCaller.openWelcomeScreen(), null);

    globalThis.game.user.isGM = true;
    globalThis.game.settings.get = () => false;

    assert.equal(globalThis.CommlinkCaller.openWelcomeScreen(), null);

    globalThis.game.settings.get = () => true;

    const newWelcome = globalThis.CommlinkCaller.openWelcomeScreen();

    assert.ok(newWelcome instanceof globalThis.CommlinkCaller.WelcomeScreen);
    assert.equal(newWelcome.renderCount, 1);
    assert.deepEqual(newWelcome.renderOptions, { force: true });

    globalThis.foundry.applications.instances.set(
      globalThis.CommlinkCaller.WelcomeScreen.DEFAULT_OPTIONS.id,
      existingWelcome
    );

    const reusedWelcome = globalThis.CommlinkCaller.openWelcomeScreen();

    assert.equal(reusedWelcome, existingWelcome);
    assert.equal(existingWelcome.renderCount, 1);
    assert.deepEqual(existingWelcome.renderOptions, { force: true });

    await reusedWelcome._submitWelcome({
      preventDefault: () => {},
      currentTarget: { hideWelcome: "on" }
    });

    assert.deepEqual(savedSettings.at(-1), [
      "foundry-commlink-caller",
      "showWelcome",
      false
    ]);

    const showAgainWelcome = new globalThis.CommlinkCaller.WelcomeScreen();

    await showAgainWelcome._submitWelcome({
      preventDefault: () => {},
      currentTarget: {}
    });

    assert.deepEqual(savedSettings.at(-1), [
      "foundry-commlink-caller",
      "showWelcome",
      true
    ]);
  } finally {
    globalThis.FormData = originalFormData;
  }
});

test("welcome template explains entry points and starts with checked preference", async () => {
  const template = await readFile(new URL("../templates/welcome.hbs", import.meta.url), "utf8");

  assert.equal(template.includes("scene-control satellite button"), true);
  assert.equal(template.includes("CommlinkCaller.openContactManager"), false);
  assert.equal(template.includes("name=\"hideWelcome\""), true);
  assert.equal(template.includes("{{#if hideWelcome}}checked{{/if}}"), true);
  assert.equal(template.includes("data-action=\"open-contact-manager\""), true);
});

test("contact manager template keeps ids internal and exposes FilePicker buttons", async () => {
  const template = await readFile(new URL("../templates/contact-manager.hbs", import.meta.url), "utf8");

  assert.equal(template.includes("name=\"id\""), false);
  assert.equal(template.includes("name=\"originalId\""), false);
  assert.equal(template.includes("commlink-caller-manager__targets"), true);
  assert.equal(template.includes("data-target-id=\"{{id}}\""), true);
  assert.equal(template.includes("data-action=\"toggle-target\""), true);
  assert.equal(template.includes("data-action=\"toggle-all-targets\""), true);
  assert.equal(template.includes("{{#if allPlayerTargetsSelected}}"), true);
  assert.equal(template.includes("{{#if isSelf}}is-self{{/if}}"), true);
  assert.equal(template.includes("data-contact-drop-zone"), true);
  assert.equal(template.includes("Drop an actor here to create a contact."), true);
  assert.equal(template.includes("data-contact-target=\"{{id}}\""), false);
  assert.equal(template.includes("{{#each callTargets}}"), true);
  assert.equal(template.includes("multiple size=\"4\""), false);
  assert.equal(template.includes("name=\"ringtonePreset\""), false);
  assert.equal(template.includes("data-action=\"apply-ringtone-preset\""), false);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"portrait\" data-type=\"image\""), true);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"ringtone\" data-type=\"audio\""), false);
  assert.equal(template.includes("Select a contact or create a new one."), false);
});

test("module stylesheet defines a theme-aware design system", async () => {
  const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");

  assert.equal(css.includes("--commlink-font-sans"), true);
  assert.equal(css.includes("--commlink-font-mono"), true);
  assert.equal(css.includes("--commlink-color-bg"), true);
  assert.equal(css.includes("--commlink-color-surface"), true);
  assert.equal(css.includes("--commlink-color-accent"), true);
  assert.equal(css.includes("--commlink-space-3"), true);
  assert.equal(css.includes("body.theme-dark .commlink-caller-contact-manager"), true);
  assert.equal(css.includes("body.theme-light .commlink-caller-contact-manager"), true);
  assert.equal(css.includes("@media (prefers-color-scheme: dark)"), true);
  assert.equal(css.includes(".commlink-caller-manager__targets"), true);
  assert.equal(css.includes(".commlink-caller-manager__drop-zone"), true);
  assert.equal(css.includes(".commlink-caller-manager.is-drop-active .commlink-caller-manager__drop-zone"), true);
  assert.equal(css.includes("--commlink-ease-spring"), true);
  assert.equal(css.includes(".commlink-caller-target-pill.is-selected::before"), true);
  assert.equal(css.includes(".commlink-caller-target-pill.is-self"), true);
  assert.equal(css.includes("filter: blur(0.6rem);"), true);
  assert.equal(css.includes(".commlink-caller-manager__list {\n  min-height: 0;"), true);
  assert.equal(css.includes(".commlink-caller-contact-manager .window-content button,"), true);
  assert.equal(css.includes(".commlink-caller-welcome .window-content button,"), true);
  assert.equal(css.includes(".commlink-caller-contact-manager button,"), false);
  assert.equal(css.includes(".commlink-caller-welcome button,"), false);
  assert.equal(css.includes(".commlink-caller-contact-manager input,"), true);
  assert.equal(css.includes(".commlink-caller-phone__actions button:active"), true);
});

test("incoming call template renders a two-layer phone frame", async () => {
  const template = await readFile(new URL("../templates/incoming-call.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");

  assert.equal(template.includes("commlink-caller-phone {{frameClass}}"), true);
  assert.equal(template.includes("{{#if hasPhoneFrame}}"), true);
  assert.equal(template.includes("{{else}}"), true);
  assert.equal(template.includes("commlink-caller-phone__screen"), true);
  assert.equal(template.includes("commlink-caller-phone__caller"), true);
  assert.equal(template.includes("commlink-caller-phone__actions"), true);
  assert.equal(template.includes("commlink-caller-phone__close"), true);
  assert.equal(template.includes("data-action=\"change-ringtone\""), true);
  assert.equal(template.includes("For {{targetName}}"), true);
  assert.equal(template.includes("{{contact.message}}"), false);
  assert.equal(template.includes("commlink-caller-incoming__body"), false);
  assert.equal(css.includes(".commlink-caller-incoming-dialog .window-header {\n  display: none;"), true);
  assert.equal(css.includes(".commlink-caller-phone--none"), true);
  assert.equal(css.includes(".commlink-caller-phone--none .commlink-caller-phone__actions"), true);
  assert.equal(css.includes(".commlink-caller-phone--cyberpunk::before"), true);
  assert.equal(css.includes(".commlink-caller-phone--modern::before"), true);
  assert.equal(css.includes(".commlink-caller-phone--retro::before"), true);
  assert.equal(css.includes(".commlink-caller-phone--corporate::before"), true);
  assert.equal(css.includes(".commlink-caller-phone__actions"), true);
  assert.equal(css.includes("max-height: 27rem"), true);
});

test("bundled ringtone presets ship the complete normalized OGG library", async () => {
  const ringtoneDirectory = new URL("../assets/sounds/ringtones/", import.meta.url);
  const ringtoneFiles = (await readdir(ringtoneDirectory))
    .filter((fileName) => fileName.endsWith(".ogg"))
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  const expectedFiles = Array.from({ length: ringtoneFiles.length }, (_value, index) => `ringtone-${index + 1}.ogg`);

  assert.deepEqual(ringtoneFiles, expectedFiles);
  assert.equal((await readdir(ringtoneDirectory)).some((fileName) => fileName.endsWith(".mp3")), false);
  assert.equal(globalThis.CommlinkCaller.RINGTONE_PRESETS.length, expectedFiles.length);

  for (const preset of globalThis.CommlinkCaller.RINGTONE_PRESETS) {
    const presetIndex = globalThis.CommlinkCaller.RINGTONE_PRESETS.indexOf(preset) + 1;

    assert.equal(preset.label, `Ringtone ${presetIndex}`);
    assert.equal(preset.path, `modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-${presetIndex}.ogg`);
    assert.equal(preset.path.startsWith("modules/foundry-commlink-caller/assets/sounds/ringtones/"), true);

    const localPath = preset.path.replace("modules/foundry-commlink-caller/", "../");
    const audioFile = await stat(new URL(localPath, import.meta.url));

    assert.equal(audioFile.isFile(), true);
    assert.equal(audioFile.size > 0, true);
  }

  const credits = await readFile(new URL("../assets/sounds/CREDITS.md", import.meta.url), "utf8");

  assert.equal(credits.includes("Creative Commons Zero"), true);
});

test("contact manager file buttons delegate to Foundry FilePicker.fromButton", async () => {
  const renderedPickers = [];
  const fromButtonCalls = [];
  const originalHTMLButtonElement = globalThis.HTMLButtonElement;
  const button = {};

  globalThis.HTMLButtonElement = class HTMLButtonElement {};
  Object.setPrototypeOf(button, globalThis.HTMLButtonElement.prototype);
  globalThis.foundry.applications.apps.FilePicker = {
    fromButton: (targetButton) => {
      fromButtonCalls.push(targetButton);

      return {
        render: (options) => renderedPickers.push(options)
      };
    }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();

    manager._browseFile({
      preventDefault: () => {},
      currentTarget: button
    });

    assert.deepEqual(fromButtonCalls, [button]);
    assert.deepEqual(renderedPickers, [{ force: true }]);
  } finally {
    if (originalHTMLButtonElement) globalThis.HTMLButtonElement = originalHTMLButtonElement;
    else delete globalThis.HTMLButtonElement;
  }
});

test("contact manager binds native DragDrop to actor drop zones", () => {
  const boundDragDrops = [];
  const originalUx = globalThis.foundry.applications.ux;
  const dropElement = {
    classList: {
      add: () => {},
      remove: () => {}
    }
  };

  globalThis.foundry.applications.ux = {
    DragDrop: class DragDrop {
      constructor(config) {
        this.config = config;
      }

      bind(element) {
        boundDragDrops.push({ element, config: this.config });

        return this;
      }
    }
  };
  globalThis.game = {
    user: { isGM: true }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();
    const element = {
      querySelector: (selector) => selector === ".commlink-caller-manager" ? dropElement : null,
      querySelectorAll: () => []
    };

    manager.element = element;
    manager._onRender({}, {});

    assert.equal(boundDragDrops.length, 1);
    assert.equal(boundDragDrops[0].element, element);
    assert.equal(boundDragDrops[0].config.dropSelector, "[data-contact-drop-zone]");
    assert.equal(boundDragDrops[0].config.permissions.drop(), true);
    assert.equal(typeof boundDragDrops[0].config.callbacks.drop, "function");
  } finally {
    if (originalUx) globalThis.foundry.applications.ux = originalUx;
    else delete globalThis.foundry.applications.ux;
  }
});

test("dropping an actor creates a contact from its name and portrait", async () => {
  const savedSettings = [];
  const originalUx = globalThis.foundry.applications.ux;
  const originalFoundryUtils = globalThis.foundry.utils;
  const originalFromUuid = globalThis.fromUuid;

  globalThis.foundry.applications.ux = {
    TextEditor: {
      getDragEventData: () => ({
        type: "Actor",
        uuid: "Compendium.world.contacts.Actor.contact-actor"
      })
    }
  };
  globalThis.foundry.utils = Object.assign({}, originalFoundryUtils, {
    randomID: () => "dropped-contact"
  });
  globalThis.fromUuid = async (uuid) => {
    assert.equal(uuid, "Compendium.world.contacts.Actor.contact-actor");

    return {
      documentName: "Actor",
      name: "Captain Halley",
      img: "",
      prototypeToken: {
        texture: {
          src: "captain-token.webp"
        }
      }
    };
  };
  globalThis.game = {
    user: { isGM: true },
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        assert.equal(setting, "contacts");

        return [];
      },
      set: async (...args) => savedSettings.push(args)
    }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();
    manager.element = { querySelector: () => null };

    await manager._onDropActor({
      preventDefault: () => {}
    });

    assert.deepEqual(savedSettings, [[
      "foundry-commlink-caller",
      "contacts",
      [{
        id: "dropped-contact",
        name: "Captain Halley",
        handle: "",
        portrait: "captain-token.webp",
        ringtone: "",
        message: "Incoming call",
        volume: 0.8
      }]
    ]]);
    assert.equal(manager._editingContactId, "dropped-contact");
    assert.equal(manager.renderCount, 1);
    assert.deepEqual(manager.renderOptions, { force: true });
  } finally {
    if (originalUx) globalThis.foundry.applications.ux = originalUx;
    else delete globalThis.foundry.applications.ux;
    if (originalFoundryUtils) globalThis.foundry.utils = originalFoundryUtils;
    else delete globalThis.foundry.utils;
    if (originalFromUuid) globalThis.fromUuid = originalFromUuid;
    else delete globalThis.fromUuid;
  }
});

test("contact manager rejects non-actor drops without saving contacts", async () => {
  const warnings = [];
  const savedSettings = [];
  const originalUx = globalThis.foundry.applications.ux;
  const originalUi = globalThis.ui;

  globalThis.foundry.applications.ux = {
    TextEditor: {
      getDragEventData: () => ({
        type: "Item",
        uuid: "Item.item-id"
      })
    }
  };
  globalThis.game = {
    user: { isGM: true },
    settings: {
      get: () => [],
      set: async (...args) => savedSettings.push(args)
    }
  };
  globalThis.ui = {
    notifications: {
      warn: (message) => warnings.push(message)
    }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();
    manager.element = { querySelector: () => null };

    await manager._onDropActor({
      preventDefault: () => {}
    });

    assert.deepEqual(savedSettings, []);
    assert.deepEqual(warnings, ["Drop an Actor to create a commlink contact."]);
    assert.equal(manager.renderCount, 0);
  } finally {
    if (originalUx) globalThis.foundry.applications.ux = originalUx;
    else delete globalThis.foundry.applications.ux;
    if (originalUi) globalThis.ui = originalUi;
    else delete globalThis.ui;
  }
});

test("contact manager passes selected recipient to placeCall", async () => {
  const placedCalls = [];
  const manager = new globalThis.CommlinkCaller.ContactManager();
  const originalPlaceCall = globalThis.CommlinkCaller.placeCall;

  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ]
  };
  manager._targetUserIds = ["player", "gm"];
  globalThis.CommlinkCaller.placeCall = async (...args) => placedCalls.push(args);

  try {
    await manager._placeCall({
      preventDefault: () => {},
      currentTarget: { dataset: { contactId: "ace" } }
    });

  assert.deepEqual(placedCalls, [[
    "ace",
    { targetUserIds: ["player", "gm"] }
  ]]);
  } finally {
    globalThis.CommlinkCaller.placeCall = originalPlaceCall;
  }
});

test("contact manager persists global recipient pill selections", async () => {
  const savedSettings = [];

  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
    settings: {
      get: () => ({ __global__: [] }),
      set: async (...args) => savedSettings.push(args)
    }
  };

  const manager = new globalThis.CommlinkCaller.ContactManager();

  await manager._toggleCallTarget({
    preventDefault: () => {},
    currentTarget: {
      dataset: { targetId: "player" }
    }
  });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: ["player"] }
  ]);
  assert.deepEqual(manager._targetUserIds, ["player"]);

  await manager._toggleCallTarget({
    preventDefault: () => {},
    currentTarget: {
      dataset: { targetId: "gm" }
    }
  });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: ["player", "gm"] }
  ]);

  await manager._toggleAllTargets({ preventDefault: () => {} });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: ["gm"] }
  ]);

  await manager._toggleAllTargets({ preventDefault: () => {} });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: ["gm", "player"] }
  ]);

  await manager._toggleCallTarget({
    preventDefault: () => {},
    currentTarget: {
      dataset: { targetId: "gm" }
    }
  });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: ["player"] }
  ]);

  await manager._toggleAllTargets({ preventDefault: () => {} });

  assert.deepEqual(savedSettings.at(-1), [
    "foundry-commlink-caller",
    "contactTargetSelections",
    { __global__: [] }
  ]);
});

test("saving an existing contact preserves the selected contact ID", async () => {
  const savedSettings = [];
  const contacts = [
    {
      id: "ace",
      name: "Ace",
      handle: "channel-1",
      portrait: "",
      ringtone: "",
      message: "Ready?",
      volume: 0.5
    },
    {
      id: "target",
      name: "Target",
      handle: "channel-2",
      portrait: "",
      ringtone: "",
      message: "Standing by",
      volume: 0.25
    }
  ];
  const originalFormData = globalThis.FormData;

  globalThis.FormData = class TestFormData {
    constructor(form) {
      this.form = form;
    }

    get(fieldName) {
      return this.form[fieldName] || "";
    }
  };
  globalThis.game = {
    settings: {
      get: () => contacts,
      set: async (...args) => savedSettings.push(args)
    }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();
    manager._editingContactId = "ace";

    await manager._saveContact({
      preventDefault: () => {},
      currentTarget: {
        originalId: "target",
        id: "target",
        name: "Ace Updated",
        handle: "channel-updated",
        portrait: "ace.webp",
        ringtone: "ace.ogg",
        message: "Updated",
        volume: "0.75"
      }
    });

    assert.deepEqual(savedSettings, [[
      "foundry-commlink-caller",
      "contacts",
      [
        {
          id: "ace",
          name: "Ace Updated",
          handle: "channel-updated",
          portrait: "ace.webp",
          ringtone: "",
          message: "Updated",
          volume: 0.75
        },
        {
          id: "target",
          name: "Target",
          handle: "channel-2",
          portrait: "",
          ringtone: "",
          message: "Standing by",
          volume: 0.25
        }
      ]
    ]]);
    assert.equal(manager._editingContactId, null);
  } finally {
    globalThis.FormData = originalFormData;
  }
});

test("saving a new contact generates a fresh ID instead of trusting form IDs", async () => {
  const savedSettings = [];
  const contacts = [{
    id: "target",
    name: "Target",
    handle: "channel-2",
    portrait: "",
    ringtone: "",
    message: "Standing by",
    volume: 0.25
  }];
  const originalFormData = globalThis.FormData;
  const originalFoundryUtils = globalThis.foundry.utils;

  globalThis.FormData = class TestFormData {
    constructor(form) {
      this.form = form;
    }

    get(fieldName) {
      return this.form[fieldName] || "";
    }
  };
  globalThis.foundry.utils = Object.assign({}, originalFoundryUtils, {
    randomID: () => "generated-contact"
  });
  globalThis.game = {
    settings: {
      get: () => contacts,
      set: async (...args) => savedSettings.push(args)
    }
  };

  try {
    const manager = new globalThis.CommlinkCaller.ContactManager();
    manager._newContact({ preventDefault: () => {} });

    await manager._saveContact({
      preventDefault: () => {},
      currentTarget: {
        originalId: "target",
        id: "target",
        name: "Nova",
        handle: "channel-3",
        portrait: "nova.webp",
        ringtone: "nova.ogg",
        message: "Incoming",
        volume: "0.65"
      }
    });

    assert.deepEqual(savedSettings, [[
      "foundry-commlink-caller",
      "contacts",
      [
        {
          id: "target",
          name: "Target",
          handle: "channel-2",
          portrait: "",
          ringtone: "",
          message: "Standing by",
          volume: 0.25
        },
        {
          id: "generated-contact",
          name: "Nova",
          handle: "channel-3",
          portrait: "nova.webp",
          ringtone: "",
          message: "Incoming",
          volume: 0.65
        }
      ]
    ]]);
    assert.equal(manager._editingContactId, null);
  } finally {
    globalThis.FormData = originalFormData;
    if (originalFoundryUtils) globalThis.foundry.utils = originalFoundryUtils;
    else delete globalThis.foundry.utils;
  }
});

test("placeCall emits normalized incoming-call payload for GMs", async () => {
  const emittedPayloads = [];
  const infos = [];
  const warnings = [];

  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
    socket: {
      emit: (...args) => emittedPayloads.push(args)
    },
    settings: {
      get: () => [{
        id: "ace",
        name: " Ace ",
        handle: " channel-1 ",
        portrait: "",
        ringtone: " ring.ogg ",
        message: " Pick up ",
        volume: 0.45
      }]
    }
  };
  globalThis.foundry.utils = {
    randomID: () => "call-id"
  };
  globalThis.ui = {
    notifications: {
      info: (message) => infos.push(message),
      warn: (message) => warnings.push(message)
    }
  };

  await globalThis.CommlinkCaller.placeCall("ace");

  assert.deepEqual(emittedPayloads, [[
    "module.foundry-commlink-caller",
    {
      type: "incoming-call",
      callId: "call-id",
      targetUserId: "",
      targetUserName: "All players",
      callerUserId: "gm",
      callerUserName: "Gamemaster",
      contact: {
        id: "ace",
        name: "Ace",
        handle: "channel-1",
        portrait: "",
        ringtone: "ring.ogg",
        message: "Pick up",
        volume: 0.45
      }
    }
  ]]);
  assert.deepEqual(infos, []);
  assert.deepEqual(warnings, []);

  await globalThis.CommlinkCaller.placeCall("ace", { targetUserId: "player" });

  assert.equal(emittedPayloads[1][1].targetUserId, "player");
  assert.equal(emittedPayloads[1][1].targetUserName, "Raven");

  await globalThis.CommlinkCaller.placeCall("missing");

  assert.equal(emittedPayloads.length, 2);
  assert.equal(warnings.length, 1);
});

test("placeCall renders the incoming phone for a GM self test", async () => {
  const emittedPayloads = [];
  const audioCalls = [];
  const dialogs = [];
  const templates = [];
  const infos = [];

  globalThis.foundry.utils = {
    randomID: () => "self-call-id"
  };
  globalThis.foundry.audio = {
    AudioHelper: {
      play: async (...args) => audioCalls.push(args)
    }
  };
  globalThis.foundry.applications.handlebars = {
    renderTemplate: async (...args) => {
      templates.push(args);

      return "<section class=\"commlink-caller-incoming\">Self test</section>";
    }
  };
  globalThis.CommlinkCaller.DialogV2 = class DialogV2 {
    constructor(options) {
      this.options = options;
      this.element = { querySelector: () => null };
      dialogs.push(this);
    }

    async render(options) {
      this.renderOptions = options;
      this.renderComplete = true;
      return this;
    }
  };
  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
    socket: {
      emit: (...args) => emittedPayloads.push(args)
    },
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        if (setting === "preferredPhoneFrame") return "cyberpunk";
        if (setting === "preferredRingtone") return "";

        return [{
          id: "ace",
          name: "Ace",
          handle: "channel-1",
          portrait: "",
          ringtone: "",
          message: "Pick up",
          volume: 0.4
        }];
      }
    }
  };
  globalThis.ui = {
    notifications: {
      info: (message) => infos.push(message)
    }
  };

  const payloads = await globalThis.CommlinkCaller.placeCall("ace", { targetUserId: "gm" });

  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].renderComplete, true);
  assert.deepEqual(dialogs[0].renderOptions, { force: true });
  assert.equal(templates[0][1].targetName, "Gamemaster");
  assert.equal(payloads[0].targetUserId, "gm");
  assert.equal(payloads[0].targetUserName, "Gamemaster");
  assert.deepEqual(emittedPayloads.map((entry) => entry[1].type), [
    "incoming-call",
    "call-status"
  ]);
  assert.deepEqual(audioCalls, [[
    {
      src: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-1.ogg",
      volume: 0.4,
      autoplay: true,
      loop: false
    },
    false
  ]]);
  assert.deepEqual(infos, []);
});

test("call status messages notify the calling GM once", () => {
  const infos = [];

  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true }
  };
  globalThis.ui = {
    notifications: {
      info: (message) => infos.push(message)
    }
  };

  globalThis.CommlinkCaller.receiveCallStatus({
    type: "call-status",
    callId: "status-test",
    status: "ringing",
    contactName: "Mr. Johnson",
    targetUserId: "player",
    targetUserName: "Raven",
    callerUserId: "gm"
  });
  globalThis.CommlinkCaller.receiveCallStatus({
    type: "call-status",
    callId: "status-test",
    status: "ringing",
    contactName: "Mr. Johnson",
    targetUserId: "player",
    targetUserName: "Raven",
    callerUserId: "gm"
  });
  globalThis.CommlinkCaller.receiveCallStatus({
    type: "call-status",
    callId: "status-test",
    status: "answered",
    contactName: "Mr. Johnson",
    targetUserId: "player",
    targetUserName: "Raven",
    callerUserId: "gm"
  });

  assert.deepEqual(infos, [
    "Raven answered: Mr. Johnson."
  ]);
});

test("receiveSocketMessage targets recipients and renders themed incoming calls", async () => {
  const audioCalls = [];
  const dialogs = [];
  const emittedPayloads = [];
  const templates = [];
  let finishRender;
  let receiveComplete = false;

  globalThis.foundry.audio = {
    AudioHelper: {
      play: async (...args) => audioCalls.push(args)
    }
  };
  globalThis.CommlinkCaller.DialogV2 = class DialogV2 {
    constructor(options) {
      this.options = options;
      dialogs.push(this);
    }

    async render(options) {
      this.renderOptions = options;
      await new Promise((resolve) => {
        finishRender = resolve;
      });
      this.renderComplete = true;
      return this;
    }
  };
  globalThis.foundry.applications.api.DialogV2 = globalThis.CommlinkCaller.DialogV2;
  globalThis.game = {
    user: { id: "player", name: "Raven", isGM: false },
    socket: {
      emit: (...args) => emittedPayloads.push(args)
    },
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        if (setting === "preferredPhoneFrame") return "none";
        if (setting === "preferredRingtone") return "";

        return undefined;
      }
    }
  };
  globalThis.foundry.applications.handlebars = {
    renderTemplate: async (...args) => {
      templates.push(args);

      return "<section class=\"commlink-caller-incoming\">Incoming</section>";
    }
  };

  await globalThis.CommlinkCaller.receiveSocketMessage({ type: "not-a-call" });

  assert.equal(audioCalls.length, 0);
  assert.equal(dialogs.length, 0);

  await globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
    callId: "other-call",
    targetUserId: "other-player",
    contact: { id: "caller", name: "Nova" }
  });

  assert.equal(audioCalls.length, 0);
  assert.equal(dialogs.length, 0);

  const receivePromise = globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
    callId: "call-1",
    targetUserId: "player",
    targetUserName: "Raven",
    callerUserId: "gm",
    contact: {
      id: " caller ",
      name: " Nova ",
      handle: " @nova ",
      portrait: " portrait.webp ",
      ringtone: " ring.ogg ",
      message: " Answer? ",
      volume: "0.25"
    }
  });
  receivePromise.then(() => {
    receiveComplete = true;
  });

  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dialogs.length, 1);
  assert.deepEqual(dialogs[0].renderOptions, { force: true });
  assert.equal(receiveComplete, false);

  finishRender();

  assert.equal(await receivePromise, undefined);

  const normalizedContact = {
    id: "caller",
    name: "Nova",
    handle: "@nova",
    portrait: "portrait.webp",
    ringtone: "ring.ogg",
    message: "Answer?",
    volume: 0.25
  };

  assert.deepEqual(emittedPayloads[0], [
    "module.foundry-commlink-caller",
    {
      type: "call-status",
      callId: "call-1",
      status: "ringing",
      contactName: "Nova",
      targetUserId: "player",
      targetUserName: "Raven",
      callerUserId: "gm"
    }
  ]);
  assert.deepEqual(audioCalls, [[
    {
      src: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-1.ogg",
      volume: 0.25,
      autoplay: true,
      loop: false
    },
    false
  ]]);
  assert.equal(templates[0][0], "modules/foundry-commlink-caller/templates/incoming-call.hbs");
  assert.deepEqual(templates[0][1].contact, normalizedContact);
  assert.equal(templates[0][1].targetName, "Raven");
  assert.equal(templates[0][1].frame, "none");
  assert.equal(templates[0][1].frameClass, "commlink-caller-phone--none");
  assert.equal(templates[0][1].hasPhoneFrame, false);
  assert.deepEqual(
    templates[0][1].ringtonePresets,
    globalThis.CommlinkCaller.RINGTONE_PRESETS.map((preset, index) => ({
      ...preset,
      selected: index === 0
    }))
  );
  assert.deepEqual(dialogs[0].options.classes, ["commlink-caller-incoming-dialog"]);
  assert.deepEqual(dialogs[0].options.window, {
    title: "",
    resizable: false
  });
  assert.deepEqual(dialogs[0].options.position, {
    width: 390,
    height: 620
  });
  assert.equal(dialogs[0].options.content, "<section class=\"commlink-caller-incoming\">Incoming</section>");
  assert.equal(dialogs[0].options.buttons.length, 1);
  assert.equal(dialogs[0].options.buttons[0].action, "dismiss");
  assert.equal(dialogs[0].renderComplete, true);

  finishRender = undefined;

  const shownDialog = globalThis.CommlinkCaller.showIncomingCall(normalizedContact);
  let showComplete = false;
  shownDialog.then(() => {
    showComplete = true;
  });

  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dialogs.length, 2);
  assert.deepEqual(dialogs[1].renderOptions, { force: true });
  assert.equal(showComplete, false);

  finishRender();

  assert.equal(await shownDialog, dialogs[1]);
  assert.equal(dialogs[1].renderComplete, true);

  globalThis.game.user.isGM = true;
  globalThis.game.user.id = "gm";

  await globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
    contact: { id: "gm", name: "GM" }
  });

  assert.equal(audioCalls.length, 1);
  assert.equal(dialogs.length, 2);

  const selfTestCall = globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
    callId: "gm-test",
    targetUserId: "gm",
    targetUserName: "Gamemaster",
    callerUserId: "gm",
    contact: { id: "gm", name: "GM Test", ringtone: "" }
  });

  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dialogs.length, 3);

  finishRender();
  await selfTestCall;
});

test("playRingtone skips missing sounds and logs playback failures", async () => {
  const errors = [];
  const originalWarn = globalThis.console.warn;

  globalThis.foundry.audio = {
    AudioHelper: {
      play: async () => {
        throw new Error("no speaker");
      }
    }
  };
  globalThis.game = {
    settings: {
      get: () => ""
    }
  };
  globalThis.console = Object.assign(globalThis.console, {
    warn: (...args) => errors.push(args)
  });

  try {
    await globalThis.CommlinkCaller.playRingtone({ name: "Silent", ringtone: "" });
    await globalThis.CommlinkCaller.playRingtone({
      name: "Noisy",
      ringtone: "bad.ogg",
      volume: 0.3
    });
  } finally {
    globalThis.console.warn = originalWarn;
  }

  assert.equal(errors.length, 2);
  assert.equal(errors[0][0], "Commlink Caller failed to play ringtone.");
});

test("incoming phone ringtone selector saves and previews the selected preset", async () => {
  const audioCalls = [];
  const savedSettings = [];
  const templates = [];
  const listeners = new Map();

  globalThis.foundry.audio = {
    AudioHelper: {
      play: async (...args) => audioCalls.push(args)
    }
  };
  globalThis.foundry.applications.handlebars = {
    renderTemplate: async (...args) => {
      templates.push(args);

      return "<section class=\"commlink-caller-incoming\">Incoming</section>";
    }
  };
  globalThis.CommlinkCaller.DialogV2 = class DialogV2 {
    constructor() {
      this.element = {
        querySelector: (selector) => selector === "[data-action='change-ringtone']"
          ? { addEventListener: (eventName, callback) => listeners.set(eventName, callback) }
          : null,
        querySelectorAll: () => []
      };
    }

    async render() {
      return this;
    }
  };
  globalThis.game = {
    user: { id: "player", name: "Raven", isGM: false },
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        if (setting === "preferredPhoneFrame") return "cyberpunk";
        if (setting === "preferredRingtone") return "modules/foundry-commlink-caller/assets/sounds/ringtones/retired.mp3";

        return undefined;
      },
      set: async (...args) => savedSettings.push(args)
    }
  };
  globalThis.ui = {
    notifications: {
      info: () => {}
    }
  };

  await globalThis.CommlinkCaller.showIncomingCall({
    id: "ace",
    name: "Ace",
    volume: 0.35
  });

  assert.equal(templates[0][1].ringtonePresets[0].selected, true);
  assert.equal(templates[0][1].ringtonePresets.some((preset, index) => index > 0 && preset.selected), false);

  await listeners.get("change")({
    currentTarget: {
      value: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-4.ogg"
    }
  });

  assert.deepEqual(savedSettings, [[
    "foundry-commlink-caller",
    "preferredRingtone",
    "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-4.ogg"
  ]]);
  assert.deepEqual(audioCalls, [[
    {
      src: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-4.ogg",
      volume: 0.35,
      autoplay: true,
      loop: false
    },
    false
  ]]);
});

test("playRingtone uses the receiving user's preferred ringtone when set", async () => {
  const audioCalls = [];

  globalThis.foundry.audio = {
    AudioHelper: {
      play: async (...args) => audioCalls.push(args)
    }
  };
  globalThis.game = {
    settings: {
      get: (moduleId, setting) => {
        assert.equal(moduleId, "foundry-commlink-caller");
        assert.equal(setting, "preferredRingtone");

        return "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-7.ogg";
      }
    }
  };

  await globalThis.CommlinkCaller.playRingtone({
    name: "Caller",
    ringtone: "caller.ogg",
    volume: 0.4
  });

  assert.deepEqual(audioCalls, [[
    {
      src: "modules/foundry-commlink-caller/assets/sounds/ringtones/ringtone-7.ogg",
      volume: 0.4,
      autoplay: true,
      loop: false
    },
    false
  ]]);
});
