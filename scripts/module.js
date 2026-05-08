const MODULE_ID = "foundry-commlink-caller";
const CONTACTS_SETTING = "contacts";
const SHOW_WELCOME_SETTING = "showWelcome";
const SHOW_SCENE_CONTROL_BUTTON_SETTING = "showSceneControlButton";
const PREFERRED_RINGTONE_SETTING = "preferredRingtone";
const PREFERRED_PHONE_FRAME_SETTING = "preferredPhoneFrame";
const SOCKET_NAME = `module.${MODULE_ID}`;
const ALL_PLAYERS_TARGET = "all-players";
const CALL_STATUS_LABELS = Object.freeze({
  ringing: "is ringing",
  answered: "answered",
  dismissed: "dismissed"
});
const TEMPLATES = Object.freeze({
  manager: `modules/${MODULE_ID}/templates/contact-manager.hbs`,
  incomingCall: `modules/${MODULE_ID}/templates/incoming-call.hbs`,
  welcome: `modules/${MODULE_ID}/templates/welcome.hbs`
});
const RINGTONE_PRESETS = Object.freeze([
  {
    label: "Fantasy / Arcane - Crystal chime",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/fantasy-crystal-chime.ogg`
  },
  {
    label: "Gothic / Horror - Omen",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/gothic-omen.ogg`
  },
  {
    label: "Western - Telegraph tick",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/western-telegraph.ogg`
  },
  {
    label: "1950s / Retro - Switchboard",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/retro-1950s-switchboard.ogg`
  },
  {
    label: "Modern - Alert",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/modern-alert.ogg`
  },
  {
    label: "Cyberpunk - Commlink",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/cyberpunk-commlink.ogg`
  },
  {
    label: "Far Future - Starship hail",
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/starship-hail.ogg`
  }
]);
const PHONE_FRAME_OPTIONS = Object.freeze([
  {
    value: "cyberpunk",
    label: "Cyberpunk neon"
  },
  {
    value: "modern",
    label: "Modern glass"
  },
  {
    value: "retro",
    label: "1950s bakelite"
  },
  {
    value: "corporate",
    label: "Corporate chrome"
  }
]);
const NEW_CONTACT_ID = "__new__";
const seenCallStatuses = new Set();
const {
  ApplicationV2,
  DialogV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

globalThis.CommlinkCaller = globalThis.CommlinkCaller || {};
globalThis.CommlinkCaller.MODULE_ID = MODULE_ID;
globalThis.CommlinkCaller.CONTACTS_SETTING = CONTACTS_SETTING;
globalThis.CommlinkCaller.SHOW_WELCOME_SETTING = SHOW_WELCOME_SETTING;
globalThis.CommlinkCaller.SHOW_SCENE_CONTROL_BUTTON_SETTING = SHOW_SCENE_CONTROL_BUTTON_SETTING;
globalThis.CommlinkCaller.PREFERRED_RINGTONE_SETTING = PREFERRED_RINGTONE_SETTING;
globalThis.CommlinkCaller.PREFERRED_PHONE_FRAME_SETTING = PREFERRED_PHONE_FRAME_SETTING;
globalThis.CommlinkCaller.SOCKET_NAME = SOCKET_NAME;
globalThis.CommlinkCaller.TEMPLATES = TEMPLATES;
globalThis.CommlinkCaller.RINGTONE_PRESETS = RINGTONE_PRESETS;
globalThis.CommlinkCaller.PHONE_FRAME_OPTIONS = PHONE_FRAME_OPTIONS;
globalThis.CommlinkCaller.ApplicationV2 = ApplicationV2;
globalThis.CommlinkCaller.DialogV2 = DialogV2;
globalThis.CommlinkCaller.HandlebarsApplicationMixin = HandlebarsApplicationMixin;

function getContactModel() {
  return globalThis.CommlinkCaller.contactModel;
}

function getContacts() {
  return getContactModel().normalizeContacts(game.settings.get(MODULE_ID, CONTACTS_SETTING));
}

async function setContacts(contacts) {
  return game.settings.set(MODULE_ID, CONTACTS_SETTING, getContactModel().normalizeContacts(contacts));
}

function getContactId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createEmptyContact() {
  return {
    id: "",
    name: "",
    handle: "",
    portrait: "",
    ringtone: "",
    message: "Incoming call",
    volume: 0.8
  };
}

function getRingtonePresetOptions(ringtone) {
  return RINGTONE_PRESETS.map((preset) => ({
    label: preset.label,
    path: preset.path,
    selected: preset.path === ringtone
  }));
}

function getRingtoneSettingChoices() {
  return RINGTONE_PRESETS.reduce((choices, preset) => {
    choices[preset.path] = preset.label;

    return choices;
  }, { "": "Use caller's ringtone" });
}

function getPhoneFrameSettingChoices() {
  return PHONE_FRAME_OPTIONS.reduce((choices, option) => {
    choices[option.value] = option.label;

    return choices;
  }, {});
}

function getPhoneFrame(value) {
  const requestedFrame = typeof value === "string" ? value : "";
  const frame = PHONE_FRAME_OPTIONS.find((option) => option.value === requestedFrame);

  return frame?.value || PHONE_FRAME_OPTIONS[0].value;
}

function getUserCollection() {
  if (Array.isArray(game.users)) return game.users;
  if (typeof game.users?.contents !== "undefined") return game.users.contents;
  if (typeof game.users?.values === "function") return Array.from(game.users.values());

  return [];
}

function getUserName(user) {
  return typeof user?.name === "string" && user.name.trim() ? user.name.trim() : "Unknown user";
}

function getCallTargets() {
  const targets = [{
    id: ALL_PLAYERS_TARGET,
    name: "All players",
    isSelf: false
  }];

  for (const user of getUserCollection()) {
    if (!user?.id) continue;
    if (user.isGM && user.id !== game.user?.id) continue;

    targets.push({
      id: user.id,
      name: user.id === game.user?.id ? `${getUserName(user)} (GM test)` : getUserName(user),
      isSelf: user.id === game.user?.id
    });
  }

  return targets;
}

function getTargetUser(targetUserId) {
  return getUserCollection().find((user) => user?.id === targetUserId) || null;
}

function createCallId() {
  return foundry.utils?.randomID?.() || Math.random().toString(36).slice(2, 13);
}

function getPreferredRingtone(contact) {
  const preferredRingtone = game.settings.get(MODULE_ID, PREFERRED_RINGTONE_SETTING);

  return preferredRingtone || contact.ringtone;
}

function getPreferredPhoneFrame() {
  return getPhoneFrame(game.settings.get(MODULE_ID, PREFERRED_PHONE_FRAME_SETTING));
}

function getFormString(formData, fieldName) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

function getContactManager() {
  return foundry.applications.instances.get(ContactManager.DEFAULT_OPTIONS.id);
}

function openContactManager() {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only GMs can manage commlink contacts.");
    return null;
  }

  const manager = getContactManager() || new ContactManager();
  manager.render({ force: true });
  manager.bringToFront?.();

  return manager;
}

function getWelcomeScreen() {
  return foundry.applications.instances.get(WelcomeScreen.DEFAULT_OPTIONS.id);
}

function shouldShowWelcome() {
  return Boolean(game.user?.isGM) && game.settings.get(MODULE_ID, SHOW_WELCOME_SETTING);
}

function openWelcomeScreen({ force = false } = {}) {
  if (!game.user?.isGM) return null;
  if (!force && !shouldShowWelcome()) return null;

  const welcome = getWelcomeScreen() || new WelcomeScreen();
  welcome.render({ force: true });
  welcome.bringToFront?.();

  return welcome;
}

async function placeCall(contactId, options = {}) {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only GMs can place commlink calls.");
    return null;
  }

  const targetId = getContactId(contactId);
  const targetUserId = getContactId(options.targetUserId) || ALL_PLAYERS_TARGET;
  const targetUser = targetUserId === ALL_PLAYERS_TARGET ? null : getTargetUser(targetUserId);
  const contact = getContacts().find((candidate) => candidate.id === targetId);
  const payload = getContactModel().createCallPayload(contact, {
    callId: createCallId(),
    targetUserId: targetUserId === ALL_PLAYERS_TARGET ? "" : targetUserId,
    targetUserName: targetUser ? getUserName(targetUser) : "All players",
    callerUserId: game.user?.id || "",
    callerUserName: getUserName(game.user)
  });

  if (!payload) {
    globalThis.ui?.notifications?.warn?.("Unable to place commlink call.");
    return null;
  }

  if (targetUserId !== ALL_PLAYERS_TARGET && !targetUser) {
    globalThis.ui?.notifications?.warn?.("Unable to find that commlink recipient.");
    return null;
  }

  game.socket.emit(SOCKET_NAME, payload);
  if (targetUserId === game.user?.id) await receiveSocketMessage(payload);

  globalThis.ui?.notifications?.info?.(`Calling ${payload.targetUserName} from ${payload.contact.name}.`);

  return payload;
}

async function receiveSocketMessage(payload) {
  if (!payload) return;
  if (payload.type === "call-status") {
    receiveCallStatus(payload);
    return;
  }
  if (payload.type !== "incoming-call") return;

  const targetsCurrentUser = payload.targetUserId && payload.targetUserId === game.user?.id;
  if (payload.targetUserId && !targetsCurrentUser) return;
  if (!payload.targetUserId && game.user?.isGM) return;

  const normalizedPayload = getContactModel().createCallPayload(payload.contact);
  if (!normalizedPayload) return;

  const contact = normalizedPayload.contact;
  const call = Object.assign({}, payload, { contact });

  sendCallStatus("ringing", call);
  await playRingtone(contact);
  await showIncomingCall(contact, call);
}

function receiveCallStatus(payload) {
  if (!game.user?.isGM) return;
  if (payload.callerUserId && payload.callerUserId !== game.user?.id) return;

  const key = [payload.callId, payload.targetUserId, payload.status].join(":");
  if (seenCallStatuses.has(key)) return;
  seenCallStatuses.add(key);

  const statusLabel = CALL_STATUS_LABELS[payload.status];
  if (!statusLabel) return;

  globalThis.ui?.notifications?.info?.(`${payload.targetUserName} ${statusLabel}: ${payload.contactName}.`);
}

function sendCallStatus(status, call) {
  const statusPayload = {
    type: "call-status",
    callId: call.callId,
    status,
    contactName: call.contact?.name || "Unknown caller",
    targetUserId: game.user?.id || "",
    targetUserName: getUserName(game.user),
    callerUserId: call.callerUserId || ""
  };

  game.socket.emit(SOCKET_NAME, statusPayload);
  receiveCallStatus(statusPayload);
}

async function playRingtone(contact) {
  const ringtone = getPreferredRingtone(contact);
  if (!ringtone) return;

  try {
    await foundry.audio.AudioHelper.play({
      src: ringtone,
      volume: contact.volume,
      autoplay: true,
      loop: false
    }, false);
  } catch (error) {
    console.warn("Commlink Caller failed to play ringtone.", error);
  }
}

async function showIncomingCall(contact, call = {}) {
  const frame = getPreferredPhoneFrame();
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.incomingCall, {
    contact,
    targetName: call.targetUserName || getUserName(game.user),
    frame,
    frameClass: `commlink-caller-phone--${frame}`
  });
  const dialog = new globalThis.CommlinkCaller.DialogV2({
    window: {
      title: "Incoming Commlink Call"
    },
    content,
    buttons: [{
      action: "answer",
      label: "Answer",
      default: true,
      callback: () => sendCallStatus("answered", call)
    }, {
      action: "dismiss",
      label: "Dismiss",
      default: false,
      callback: () => sendCallStatus("dismissed", call)
    }]
  });

  await dialog.render({ force: true });

  return dialog;
}

class WelcomeScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "commlink-caller-welcome",
    classes: ["commlink-caller-welcome"],
    window: {
      title: "Commlink Caller",
      resizable: false
    },
    position: {
      width: 520
    }
  };

  static PARTS = {
    welcome: {
      template: TEMPLATES.welcome
    }
  };

  constructor(options = {}) {
    super(options);

    this._hideOnNextLogin = true;
    this._preferenceSaved = false;
  }

  async _prepareContext() {
    return {
      hideWelcome: this._hideOnNextLogin
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    const element = this.element;
    if (!element) return;

    const checkbox = element.querySelector("[name='hideWelcome']");
    if (checkbox instanceof HTMLInputElement) {
      this._hideOnNextLogin = checkbox.checked;
      checkbox.addEventListener("change", () => {
        this._hideOnNextLogin = checkbox.checked;
        this._preferenceSaved = false;
      });
    }

    element.querySelector("[data-welcome-form]")?.addEventListener("submit", this._submitWelcome.bind(this));
    element.querySelector("[data-action='open-contact-manager']")?.addEventListener("click", this._openContactManager.bind(this));
  }

  async close(options) {
    await this._savePreference();

    return super.close?.(options);
  }

  async _submitWelcome(event) {
    event?.preventDefault();

    this._setPreferenceFromForm(event?.currentTarget);

    await this._savePreference();
    await this.close();
  }

  async _openContactManager(event) {
    event?.preventDefault();

    this._setPreferenceFromForm(event?.currentTarget?.closest?.("[data-welcome-form]"));

    await this._savePreference();
    await this.close();
    openContactManager();
  }

  _setPreferenceFromForm(form) {
    if (!form) return;

    this._hideOnNextLogin = new FormData(form).get("hideWelcome") === "on";
    this._preferenceSaved = false;
  }

  async _savePreference() {
    if (this._preferenceSaved || !game.user?.isGM) return;

    await game.settings.set(MODULE_ID, SHOW_WELCOME_SETTING, !this._hideOnNextLogin);
    this._preferenceSaved = true;
  }
}

class ContactManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "commlink-caller-contact-manager",
    classes: ["commlink-caller-contact-manager"],
    window: {
      title: "Commlink contacts",
      resizable: true
    },
    position: {
      width: 720
    }
  };

  static PARTS = {
    manager: {
      template: TEMPLATES.manager
    }
  };

  constructor(options = {}) {
    super(options);

    this._editingContactId = null;
  }

  async _prepareContext() {
    const contacts = getContacts();
    const editorContact = this._getEditorContact(contacts);

    return {
      contacts,
      editorContact,
      isEditing: Boolean(editorContact),
      callTargets: getCallTargets(),
      ringtonePresets: getRingtonePresetOptions(editorContact?.ringtone || "")
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    const element = this.element;
    if (!element) return;

    element.querySelector("[data-contact-form]")?.addEventListener("submit", this._saveContact.bind(this));
    element.querySelectorAll("[data-action='new']").forEach((button) => {
      button.addEventListener("click", this._newContact.bind(this));
    });
    element.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", this._editContact.bind(this));
    });
    element.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", this._deleteContact.bind(this));
    });
    element.querySelectorAll("[data-action='call']").forEach((button) => {
      button.addEventListener("click", this._placeCall.bind(this));
    });
    element.querySelectorAll("[data-action='cancel']").forEach((button) => {
      button.addEventListener("click", this._cancelEdit.bind(this));
    });
    element.querySelectorAll("[data-action='browse-file']").forEach((button) => {
      button.addEventListener("click", this._browseFile.bind(this));
    });
    element.querySelectorAll("[data-action='apply-ringtone-preset']").forEach((select) => {
      select.addEventListener("change", this._applyRingtonePreset.bind(this));
    });
  }

  _getEditorContact(contacts) {
    if (this._editingContactId === NEW_CONTACT_ID) return createEmptyContact();
    if (!this._editingContactId) return null;

    return contacts.find((contact) => contact.id === this._editingContactId) || null;
  }

  _newContact(event) {
    event?.preventDefault();

    this._editingContactId = NEW_CONTACT_ID;
    this.render({ force: true });
  }

  _editContact(event) {
    event?.preventDefault();

    this._editingContactId = event?.currentTarget?.dataset?.contactId || null;
    this.render({ force: true });
  }

  async _deleteContact(event) {
    event?.preventDefault();

    const contactId = event?.currentTarget?.dataset?.contactId;
    if (!contactId) return;

    await setContacts(getContactModel().removeContact(getContacts(), contactId));

    if (this._editingContactId === contactId) this._editingContactId = null;
    this.render({ force: true });
  }

  async _placeCall(event) {
    event?.preventDefault();

    const contactId = event?.currentTarget?.dataset?.contactId;
    const targetUserId = this.element
      ?.querySelector(`[data-contact-target="${contactId}"]`)
      ?.value || ALL_PLAYERS_TARGET;
    if (!contactId || typeof globalThis.CommlinkCaller.placeCall !== "function") return;

    await globalThis.CommlinkCaller.placeCall(contactId, { targetUserId });
  }

  _cancelEdit(event) {
    event?.preventDefault();

    this._editingContactId = null;
    this.render({ force: true });
  }

  _browseFile(event) {
    event?.preventDefault();

    const button = event?.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    foundry.applications.apps.FilePicker.fromButton(button).render({ force: true });
  }

  _applyRingtonePreset(event) {
    const select = event?.currentTarget;
    const form = select?.closest?.("[data-contact-form]");
    const ringtoneInput = form?.querySelector?.("[name='ringtone']");

    if (!ringtoneInput) return;

    ringtoneInput.value = select?.value || "";
  }

  async _saveContact(event) {
    event?.preventDefault();

    const form = event?.currentTarget;
    if (!form) return;

    const formData = new FormData(form);
    const formContact = {
      name: getFormString(formData, "name"),
      handle: getFormString(formData, "handle"),
      portrait: getFormString(formData, "portrait"),
      ringtone: getFormString(formData, "ringtone"),
      message: getFormString(formData, "message"),
      volume: getFormString(formData, "volume")
    };
    const contacts = getContacts();
    const contactModel = getContactModel();
    const editingContactId = this._editingContactId;
    const existingIndex = editingContactId && editingContactId !== NEW_CONTACT_ID
      ? contacts.findIndex((contact) => contact.id === editingContactId)
      : -1;
    const savedContact = existingIndex >= 0
      ? contactModel.updateContact(contacts[existingIndex], formContact)
      : contactModel.createContact(formContact);

    if (!savedContact) {
      globalThis.ui?.notifications?.warn?.("Contact name is required.");
      return;
    }

    const nextContacts = contacts.slice();
    if (existingIndex >= 0) nextContacts.splice(existingIndex, 1, savedContact);
    else nextContacts.push(savedContact);

    await setContacts(nextContacts);

    this._editingContactId = null;
    this.render({ force: true });
  }
}

globalThis.CommlinkCaller.getContacts = getContacts;
globalThis.CommlinkCaller.setContacts = setContacts;
globalThis.CommlinkCaller.openContactManager = openContactManager;
globalThis.CommlinkCaller.openWelcomeScreen = openWelcomeScreen;
globalThis.CommlinkCaller.placeCall = placeCall;
globalThis.CommlinkCaller.receiveSocketMessage = receiveSocketMessage;
globalThis.CommlinkCaller.receiveCallStatus = receiveCallStatus;
globalThis.CommlinkCaller.playRingtone = playRingtone;
globalThis.CommlinkCaller.showIncomingCall = showIncomingCall;
globalThis.CommlinkCaller.WelcomeScreen = WelcomeScreen;
globalThis.CommlinkCaller.ContactManager = ContactManager;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, CONTACTS_SETTING, {
    name: "Commlink contacts",
    hint: "Stored contacts available to GMs for commlink calls.",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, SHOW_WELCOME_SETTING, {
    name: "Show welcome screen",
    hint: "Show the Commlink Caller welcome tutorial for this user. GMs only; players never receive the welcome screen.",
    scope: "user",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      if (value) globalThis.CommlinkCaller.openWelcomeScreen({ force: true });
    }
  });

  game.settings.register(MODULE_ID, SHOW_SCENE_CONTROL_BUTTON_SETTING, {
    name: "Show GM scene-control button",
    hint: "Show the Commlink contacts shortcut in the Token scene controls for GMs.",
    scope: "user",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, PREFERRED_RINGTONE_SETTING, {
    name: "Preferred ringtone",
    hint: "Override caller ringtones for calls you receive, or use the caller's configured ringtone.",
    scope: "user",
    config: true,
    type: String,
    choices: getRingtoneSettingChoices(),
    default: ""
  });

  game.settings.register(MODULE_ID, PREFERRED_PHONE_FRAME_SETTING, {
    name: "Preferred phone frame",
    hint: "Choose the commlink frame style shown when you receive a call.",
    scope: "user",
    config: true,
    type: String,
    choices: getPhoneFrameSettingChoices(),
    default: PHONE_FRAME_OPTIONS[0].value
  });

  game.settings.registerMenu(MODULE_ID, "contactManager", {
    name: "Commlink contacts",
    label: "Manage contacts",
    hint: "Create, edit, and call commlink contacts.",
    icon: "fas fa-address-book",
    restricted: true,
    type: ContactManager
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls?.tokens?.tools) return;

  controls.tokens.tools.commlinkCaller = {
    name: "commlinkCaller",
    title: "Commlink contacts",
    icon: "fa-solid fa-satellite-dish",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: Boolean(game.user?.isGM) && game.settings.get(MODULE_ID, SHOW_SCENE_CONTROL_BUTTON_SETTING),
    onChange: () => {
      globalThis.CommlinkCaller.openContactManager();
    }
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, globalThis.CommlinkCaller.receiveSocketMessage);
  globalThis.CommlinkCaller.openWelcomeScreen();
});
