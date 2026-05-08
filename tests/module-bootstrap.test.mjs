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
    }
  };
  globalThis.game = {
    user: { isGM: true },
    socket: {
      on: (...args) => socketHandlers.push(args)
    },
    settings: {
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

test("contact manager template keeps ids internal and exposes FilePicker buttons", async () => {
  const template = await readFile(new URL("../templates/contact-manager.hbs", import.meta.url), "utf8");

  assert.equal(template.includes("name=\"id\""), false);
  assert.equal(template.includes("name=\"originalId\""), false);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"portrait\" data-type=\"image\""), true);
  assert.equal(template.includes("data-action=\"browse-file\" data-target=\"ringtone\" data-type=\"audio\""), true);
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
    user: { isGM: true },
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
  assert.deepEqual(infos, ["Calling Ace."]);
  assert.deepEqual(warnings, []);

  await globalThis.CommlinkCaller.placeCall("missing");

  assert.equal(emittedPayloads.length, 1);
  assert.equal(warnings.length, 1);
});

test("receiveSocketMessage ignores GMs and renders incoming calls for players", async () => {
  const audioCalls = [];
  const dialogs = [];
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
    user: { isGM: false }
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

  const receivePromise = globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
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
    { contact: normalizedContact }
  ]]);
  assert.deepEqual(dialogs[0].options, {
    window: {
      title: "Incoming Commlink Call"
    },
    content: "<section class=\"commlink-caller-incoming\">Incoming</section>",
    buttons: [{
      action: "dismiss",
      label: "Dismiss",
      default: true
    }]
  });
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

  await globalThis.CommlinkCaller.receiveSocketMessage({
    type: "incoming-call",
    contact: { id: "gm", name: "GM" }
  });

  assert.equal(audioCalls.length, 1);
  assert.equal(dialogs.length, 2);
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
