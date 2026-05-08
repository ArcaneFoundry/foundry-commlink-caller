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
  const socketHandlers = [];

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
    socket: {
      on: (...args) => socketHandlers.push(args)
    },
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
  assert.equal(registeredHooks.has("ready"), true);

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
  globalThis.renderTemplate = async (...args) => {
    templates.push(args);

    return "<section class=\"commlink-caller-incoming\">Incoming</section>";
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
