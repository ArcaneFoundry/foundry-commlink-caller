const MODULE_ID = "foundry-commlink-caller";
const CONTACTS_SETTING = "contacts";
const CONTACT_TARGET_SELECTIONS_SETTING = "contactTargetSelections";
const SHOW_WELCOME_SETTING = "showWelcome";
const SHOW_SCENE_CONTROL_BUTTON_SETTING = "showSceneControlButton";
const PREFERRED_RINGTONE_SETTING = "preferredRingtone";
const PREFERRED_PHONE_FRAME_SETTING = "preferredPhoneFrame";
const SOCKET_NAME = `module.${MODULE_ID}`;
const ALL_PLAYERS_TARGET = "all-players";
const GLOBAL_TARGET_SELECTION_ID = "__global__";
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
const RINGTONE_PRESETS = Object.freeze(Array.from({ length: 18 }, (_value, index) => {
  const ringtoneNumber = index + 1;

  return {
    label: `Ringtone ${ringtoneNumber}`,
    path: `modules/${MODULE_ID}/assets/sounds/ringtones/ringtone-${ringtoneNumber}.ogg`
  };
}));
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
  },
  {
    value: "none",
    label: "No phone frame"
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
globalThis.CommlinkCaller.CONTACT_TARGET_SELECTIONS_SETTING = CONTACT_TARGET_SELECTIONS_SETTING;
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
    message: "Incoming call",
    volume: 0.8
  };
}

function getRingtoneSettingChoices() {
  return RINGTONE_PRESETS.reduce((choices, preset) => {
    choices[preset.path] = preset.label;

    return choices;
  }, {});
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

function normalizeTargetIds(targetIds) {
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  const normalizedIds = ids.map(getContactId).filter(Boolean);
  const uniqueIds = Array.from(new Set(normalizedIds));

  return uniqueIds.length ? uniqueIds : [ALL_PLAYERS_TARGET];
}

function getContactTargetSelections() {
  const selections = game.settings.get(MODULE_ID, CONTACT_TARGET_SELECTIONS_SETTING);

  return selections && typeof selections === "object" && !Array.isArray(selections) ? selections : {};
}

function getSelectableCallTargets() {
  return getCallTargets().filter((target) => target.id !== ALL_PLAYERS_TARGET);
}

function getSelectablePlayerTargets() {
  return getSelectableCallTargets().filter((target) => !target.isSelf);
}

function normalizeManagerTargetIds(targetIds) {
  const selectableIds = new Set(getSelectableCallTargets().map((target) => target.id));
  const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
  const normalizedIds = ids
    .map(getContactId)
    .filter((id) => selectableIds.has(id));

  return Array.from(new Set(normalizedIds));
}

function getSelectedTargetIds() {
  const selectedIds = getContactTargetSelections()[GLOBAL_TARGET_SELECTION_ID];
  const normalizedIds = normalizeManagerTargetIds(selectedIds);

  if (normalizedIds.length) return normalizedIds;
  if (Array.isArray(selectedIds)) return [];

  return getSelectableCallTargets().map((target) => target.id);
}

function getCallTargetOptions(selectedIds = getSelectedTargetIds()) {
  const selectedTargetIds = normalizeManagerTargetIds(selectedIds);

  return getSelectableCallTargets().map((target) => ({
    id: target.id,
    name: target.name,
    isSelf: target.isSelf,
    selected: selectedTargetIds.includes(target.id)
  }));
}

async function setCallTargetSelection(targetIds) {
  const selections = Object.assign({}, getContactTargetSelections());
  selections[GLOBAL_TARGET_SELECTION_ID] = normalizeManagerTargetIds(targetIds);

  await game.settings.set(MODULE_ID, CONTACT_TARGET_SELECTIONS_SETTING, selections);

  return selections[GLOBAL_TARGET_SELECTION_ID];
}

function getTargetUser(targetUserId) {
  return getUserCollection().find((user) => user?.id === targetUserId) || null;
}

function createCallId() {
  return foundry.utils?.randomID?.() || Math.random().toString(36).slice(2, 13);
}

function getDefaultRingtone() {
  return RINGTONE_PRESETS[0].path;
}

function getRingtone(value) {
  const requestedRingtone = typeof value === "string" ? value : "";
  const preset = RINGTONE_PRESETS.find((option) => option.path === requestedRingtone);

  return preset?.path || getDefaultRingtone();
}

function getRingtonePresetOptions(ringtone) {
  const selectedRingtone = getRingtone(ringtone);

  return RINGTONE_PRESETS.map((preset) => ({
    label: preset.label,
    path: preset.path,
    selected: preset.path === selectedRingtone
  }));
}

function getPreferredRingtone() {
  const preferredRingtone = game.settings.get(MODULE_ID, PREFERRED_RINGTONE_SETTING);

  return getRingtone(preferredRingtone);
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

function bringToFrontAfterRender(application, renderResult) {
  Promise.resolve(renderResult)
    .then(() => application.bringToFront?.())
    .catch((error) => console.warn("Commlink Caller could not bring the window forward.", error));
}

function openContactManager() {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only GMs can manage commlink contacts.");
    return null;
  }

  const manager = getContactManager() || new ContactManager();
  bringToFrontAfterRender(manager, manager.render({ force: true }));

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
  bringToFrontAfterRender(welcome, welcome.render({ force: true }));

  return welcome;
}

async function placeCall(contactId, options = {}) {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only GMs can place commlink calls.");
    return null;
  }

  const targetId = getContactId(contactId);
  const contact = getContacts().find((candidate) => candidate.id === targetId);
  const targetUserIds = normalizeTargetIds(options.targetUserIds || options.targetUserId || ALL_PLAYERS_TARGET);

  if (!contact) {
    globalThis.ui?.notifications?.warn?.("Unable to place commlink call.");
    return null;
  }

  if (targetUserIds.includes(ALL_PLAYERS_TARGET)) {
    const payload = await emitCallToTarget(contact, ALL_PLAYERS_TARGET);

    return [payload];
  }

  const payloads = [];

  for (const targetUserId of targetUserIds) {
    const targetUser = getTargetUser(targetUserId);
    if (!targetUser) continue;

    payloads.push(await emitCallToTarget(contact, targetUserId, targetUser));
  }

  if (!payloads.length) {
    globalThis.ui?.notifications?.warn?.("Unable to find any commlink recipients.");
    return null;
  }

  return payloads;
}

async function emitCallToTarget(contact, targetUserId, targetUser = null) {
  const payload = getContactModel().createCallPayload(contact, {
    callId: createCallId(),
    targetUserId: targetUserId === ALL_PLAYERS_TARGET ? "" : targetUserId,
    targetUserName: targetUser ? getUserName(targetUser) : "All players",
    callerUserId: game.user?.id || "",
    callerUserName: getUserName(game.user)
  });

  game.socket.emit(SOCKET_NAME, payload);
  if (targetUserId === game.user?.id) await receiveSocketMessage(payload);

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
  playRingtone(contact);
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
  if (payload.status === "ringing") return;

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
  await playRingtoneSource(getPreferredRingtone(), contact?.volume);
}

async function playRingtoneSource(ringtone, volume) {
  const selectedRingtone = getRingtone(ringtone);
  const selectedVolume = Number.isFinite(volume) ? volume : 0.8;
  if (!selectedRingtone) return;

  try {
    await foundry.audio.AudioHelper.play({
      src: selectedRingtone,
      volume: selectedVolume,
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
    frameClass: `commlink-caller-phone--${frame}`,
    hasPhoneFrame: frame !== "none",
    ringtonePresets: getRingtonePresetOptions(getPreferredRingtone())
  });
  const dialog = new globalThis.CommlinkCaller.DialogV2({
    classes: ["commlink-caller-incoming-dialog"],
    window: {
      title: "",
      resizable: false
    },
    position: {
      width: 390,
      height: 620
    },
    content,
    buttons: [{
      action: "dismiss",
      label: "Dismiss",
      default: false,
      callback: () => sendCallStatus("dismissed", call)
    }]
  });

  await dialog.render({ force: true });
  attachIncomingCallActions(dialog, call, contact);

  return dialog;
}

function attachIncomingCallActions(dialog, call, contact) {
  const element = dialog.element;
  if (!element) return;
  const findActionElements = (action) => {
    if (typeof element.querySelectorAll === "function") {
      return Array.from(element.querySelectorAll(`[data-action='${action}']`));
    }

    const match = element.querySelector?.(`[data-action='${action}']`);

    return match ? [match] : [];
  };

  findActionElements("answer-call").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    sendCallStatus("answered", call);
    await dialog.close?.();
  }));
  findActionElements("dismiss-call").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    sendCallStatus("dismissed", call);
    await dialog.close?.();
  }));
  element.querySelector("[data-action='change-ringtone']")?.addEventListener("change", async (event) => {
    const selectedRingtone = getRingtone(event.currentTarget.value);

    await game.settings.set(MODULE_ID, PREFERRED_RINGTONE_SETTING, selectedRingtone);
    await playRingtoneSource(selectedRingtone, contact?.volume);
    globalThis.ui?.notifications?.info?.("Commlink ringtone updated.");
  });
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
      title: "Commlink",
      resizable: true
    },
    position: {
      width: 620,
      height: 640
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
    this._targetUserIds = null;
  }

  async _prepareContext() {
    const contacts = getContacts();
    const editorContact = this._getEditorContact(contacts);
    const isCreating = this._editingContactId === NEW_CONTACT_ID;
    const targetUserIds = this._targetUserIds || getSelectedTargetIds();
    this._targetUserIds = targetUserIds;
    const callTargets = getCallTargetOptions(targetUserIds);
    const playerTargets = callTargets.filter((target) => !target.isSelf);
    const allPlayerTargetsSelected = Boolean(playerTargets.length) && playerTargets.every((target) => target.selected);

    return {
      contacts: contacts.map((contact) => Object.assign({}, contact, {
        isEditing: contact.id === this._editingContactId
      })),
      callTargets,
      allPlayerTargetsSelected,
      editorContact,
      isCreating,
      isEditing: Boolean(editorContact)
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
    element.querySelectorAll("[data-action='toggle-target']").forEach((button) => {
      button.addEventListener("click", this._toggleCallTarget.bind(this));
    });
    element.querySelectorAll("[data-action='toggle-all-targets']").forEach((button) => {
      button.addEventListener("click", this._toggleAllTargets.bind(this));
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
    const targetUserIds = normalizeManagerTargetIds(this._targetUserIds || getSelectedTargetIds());
    if (!contactId || typeof globalThis.CommlinkCaller.placeCall !== "function") return;
    if (!targetUserIds.length) {
      globalThis.ui?.notifications?.warn?.("Select at least one commlink recipient.");
      return;
    }

    await globalThis.CommlinkCaller.placeCall(contactId, { targetUserIds });
  }

  async _toggleCallTarget(event) {
    event?.preventDefault();

    const targetId = getContactId(event?.currentTarget?.dataset?.targetId);
    if (!targetId) return;

    const selectedIds = normalizeManagerTargetIds(this._targetUserIds || getSelectedTargetIds());
    const nextTargetIds = selectedIds.includes(targetId)
      ? selectedIds.filter((id) => id !== targetId)
      : selectedIds.concat(targetId);

    this._targetUserIds = await setCallTargetSelection(nextTargetIds);
    this.render({ force: true });
  }

  async _toggleAllTargets(event) {
    event?.preventDefault();

    const playerTargetIds = getSelectablePlayerTargets().map((target) => target.id);
    const selectedIds = normalizeManagerTargetIds(this._targetUserIds || getSelectedTargetIds());
    const selectedPlayerIds = selectedIds.filter((id) => playerTargetIds.includes(id));
    const selfTargetIds = selectedIds.filter((id) => !playerTargetIds.includes(id));
    const nextTargetIds = playerTargetIds.length && selectedPlayerIds.length === playerTargetIds.length
      ? selfTargetIds
      : Array.from(new Set(selfTargetIds.concat(playerTargetIds)));

    this._targetUserIds = await setCallTargetSelection(nextTargetIds);
    this.render({ force: true });
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

  async _saveContact(event) {
    event?.preventDefault();

    const form = event?.currentTarget;
    if (!form) return;

    const formData = new FormData(form);
    const formContact = {
      name: getFormString(formData, "name"),
      handle: getFormString(formData, "handle"),
      portrait: getFormString(formData, "portrait"),
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

  game.settings.register(MODULE_ID, CONTACT_TARGET_SELECTIONS_SETTING, {
    name: "Commlink call targets",
    hint: "Stored selected call recipients for the Commlink contacts window.",
    scope: "world",
    config: false,
    type: Object,
    default: {}
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
    hint: "Choose the ringtone that plays when your commlink receives a call.",
    scope: "user",
    config: true,
    type: String,
    choices: getRingtoneSettingChoices(),
    default: getDefaultRingtone()
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
