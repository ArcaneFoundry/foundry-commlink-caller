import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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
      "showWelcome",
      {
        name: "Show welcome screen",
        hint: "Show the Commlink Caller welcome tutorial for this user. GMs only; players never receive the welcome screen.",
        scope: "user",
        config: true,
        type: Boolean,
        default: true,
        onChange: registeredSettings[1][2].onChange
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
        hint: "Override caller ringtones for calls you receive, or use the caller's configured ringtone.",
        scope: "user",
        config: true,
        type: String,
        choices: registeredSettings[3][2].choices,
        default: ""
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
        choices: registeredSettings[4][2].choices,
        default: "cyberpunk"
      }
    ]
  ]);
  assert.equal(registeredSettings[3][2].choices[""], "Use caller's ringtone");
  assert.equal(registeredSettings[3][2].choices["modules/foundry-commlink-caller/assets/sounds/ringtones/cyberpunk-commlink.ogg"], "Cyberpunk - Commlink");
  assert.equal(registeredSettings[4][2].choices.cyberpunk, "Cyberpunk neon");
  assert.equal(registeredSettings[4][2].choices.retro, "1950s bakelite");
  assert.equal(registeredMenus.length, 1);
  assert.equal(registeredMenus[0][0], "foundry-commlink-caller");
  assert.equal(registeredMenus[0][1], "contactManager");
  assert.equal(registeredMenus[0][2].name, "Commlink contacts");
  assert.equal(registeredMenus[0][2].restricted, true);
  assert.equal(registeredMenus[0][2].type, globalThis.CommlinkCaller.ContactManager);
  assert.equal(globalThis.CommlinkCaller.TEMPLATES.manager, "modules/foundry-commlink-caller/templates/contact-manager.hbs");
  assert.equal(globalThis.CommlinkCaller.TEMPLATES.welcome, "modules/foundry-commlink-caller/templates/welcome.hbs");
  assert.equal(globalThis.CommlinkCaller.RINGTONE_PRESETS.length, 7);
  assert.equal(globalThis.CommlinkCaller.PHONE_FRAME_OPTIONS.length, 4);
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
  const unselectedPresets = globalThis.CommlinkCaller.RINGTONE_PRESETS.map((preset) => ({
    label: preset.label,
    path: preset.path,
    selected: false
  }));
  const callTargets = [
    { id: "all-players", name: "All players", isSelf: false },
    { id: "gm", name: "Gamemaster (GM test)", isSelf: true },
    { id: "player", name: "Raven", isSelf: false }
  ];

  globalThis.game = {
    user: { id: "gm", name: "Gamemaster", isGM: true },
    users: [
      { id: "gm", name: "Gamemaster", isGM: true },
      { id: "other-gm", name: "Other GM", isGM: true },
      { id: "player", name: "Raven", isGM: false }
    ],
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
    isEditing: false,
    callTargets,
    ringtonePresets: unselectedPresets
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
    isEditing: true,
    callTargets,
    ringtonePresets: unselectedPresets
  });
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
  assert.equal(template.includes("data-contact-target=\"{{id}}\""), true);
  assert.equal(template.includes("{{#each ../callTargets}}"), true);
  assert.equal(template.includes("name=\"ringtonePreset\""), true);
  assert.equal(template.includes("data-action=\"apply-ringtone-preset\""), true);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"portrait\" data-type=\"image\""), true);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"ringtone\" data-type=\"audio\""), true);
  assert.equal(template.includes("Select a contact or create a new one."), false);
});

test("incoming call template renders a two-layer phone frame", async () => {
  const template = await readFile(new URL("../templates/incoming-call.hbs", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");

  assert.equal(template.includes("commlink-caller-phone {{frameClass}}"), true);
  assert.equal(template.includes("commlink-caller-phone__screen"), true);
  assert.equal(template.includes("commlink-caller-phone__caller"), true);
  assert.equal(template.includes("For {{targetName}}"), true);
  assert.equal(template.includes("commlink-caller-incoming__body"), false);
  assert.equal(css.includes(".commlink-caller-incoming-dialog .window-header .window-title"), true);
  assert.equal(css.includes(".commlink-caller-incoming-dialog .dialog-buttons"), true);
  assert.equal(css.includes("max-height: 27rem"), true);
});

test("bundled ringtone presets cover common genres and point to shipped audio", async () => {
  const labels = globalThis.CommlinkCaller.RINGTONE_PRESETS.map((preset) => preset.label);

  assert.equal(labels.some((label) => label.includes("Fantasy")), true);
  assert.equal(labels.some((label) => label.includes("Gothic")), true);
  assert.equal(labels.some((label) => label.includes("Western")), true);
  assert.equal(labels.some((label) => label.includes("1950s")), true);
  assert.equal(labels.some((label) => label.includes("Modern")), true);
  assert.equal(labels.some((label) => label.includes("Cyberpunk")), true);
  assert.equal(labels.some((label) => label.includes("Far Future")), true);

  for (const preset of globalThis.CommlinkCaller.RINGTONE_PRESETS) {
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

test("ringtone preset selection fills the ringtone path", () => {
  const ringtoneInput = { value: "" };
  const form = {
    querySelector: (selector) => selector === "[name='ringtone']" ? ringtoneInput : null
  };
  const select = {
    value: "modules/foundry-commlink-caller/assets/sounds/ringtones/modern-alert.ogg",
    closest: (selector) => selector === "[data-contact-form]" ? form : null
  };
  const manager = new globalThis.CommlinkCaller.ContactManager();

  manager._applyRingtonePreset({ currentTarget: select });

  assert.equal(ringtoneInput.value, "modules/foundry-commlink-caller/assets/sounds/ringtones/modern-alert.ogg");
});

test("contact manager passes selected recipient to placeCall", async () => {
  const placedCalls = [];
  const manager = new globalThis.CommlinkCaller.ContactManager();
  const originalPlaceCall = globalThis.CommlinkCaller.placeCall;

  manager.element = {
    querySelector: (selector) => selector === "[data-contact-target=\"ace\"]" ? { value: "player" } : null
  };
  globalThis.CommlinkCaller.placeCall = async (...args) => placedCalls.push(args);

  try {
    await manager._placeCall({
      preventDefault: () => {},
      currentTarget: { dataset: { contactId: "ace" } }
    });

    assert.deepEqual(placedCalls, [[
      "ace",
      { targetUserId: "player" }
    ]]);
  } finally {
    globalThis.CommlinkCaller.placeCall = originalPlaceCall;
  }
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
          ringtone: "ace.ogg",
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
          ringtone: "nova.ogg",
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
  assert.deepEqual(infos, ["Calling All players from Ace."]);
  assert.deepEqual(warnings, []);

  await globalThis.CommlinkCaller.placeCall("ace", { targetUserId: "player" });

  assert.equal(emittedPayloads[1][1].targetUserId, "player");
  assert.equal(emittedPayloads[1][1].targetUserName, "Raven");

  await globalThis.CommlinkCaller.placeCall("missing");

  assert.equal(emittedPayloads.length, 2);
  assert.equal(warnings.length, 1);
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
    "Raven is ringing: Mr. Johnson.",
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
        if (setting === "preferredPhoneFrame") return "retro";
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
      src: "ring.ogg",
      volume: 0.25,
      autoplay: true,
      loop: false
    },
    false
  ]]);
  assert.deepEqual(templates, [[
    "modules/foundry-commlink-caller/templates/incoming-call.hbs",
    {
      contact: normalizedContact,
      targetName: "Raven",
      frame: "retro",
      frameClass: "commlink-caller-phone--retro"
    }
  ]]);
  assert.deepEqual(dialogs[0].options.classes, ["commlink-caller-incoming-dialog"]);
  assert.deepEqual(dialogs[0].options.window, {
    title: "",
    resizable: false
  });
  assert.deepEqual(dialogs[0].options.position, {
    width: 360,
    height: 560
  });
  assert.equal(dialogs[0].options.content, "<section class=\"commlink-caller-incoming\">Incoming</section>");
  assert.equal(dialogs[0].options.buttons.length, 2);
  assert.equal(dialogs[0].options.buttons[0].action, "answer");
  assert.equal(dialogs[0].options.buttons[1].action, "dismiss");

  dialogs[0].options.buttons[0].callback();

  assert.equal(emittedPayloads.at(-1)[1].status, "answered");
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

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "Commlink Caller failed to play ringtone.");
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

        return "modules/foundry-commlink-caller/assets/sounds/ringtones/cyberpunk-commlink.ogg";
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
      src: "modules/foundry-commlink-caller/assets/sounds/ringtones/cyberpunk-commlink.ogg",
      volume: 0.4,
      autoplay: true,
      loop: false
    },
    false
  ]]);
});
