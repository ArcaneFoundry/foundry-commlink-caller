const MODULE_ID = "foundry-commlink-caller";
const CONTACTS_SETTING = "contacts";
const WELCOME_DISMISSED_SETTING = "welcomeDismissed";
const SOCKET_NAME = `module.${MODULE_ID}`;
const TEMPLATES = Object.freeze({
  manager: `modules/${MODULE_ID}/templates/contact-manager.hbs`,
  incomingCall: `modules/${MODULE_ID}/templates/incoming-call.hbs`,
  welcome: `modules/${MODULE_ID}/templates/welcome.hbs`
});
const NEW_CONTACT_ID = "__new__";
const {
  ApplicationV2,
  DialogV2,
  HandlebarsApplicationMixin
} = foundry.applications.api;

globalThis.CommlinkCaller = globalThis.CommlinkCaller || {};
globalThis.CommlinkCaller.MODULE_ID = MODULE_ID;
globalThis.CommlinkCaller.CONTACTS_SETTING = CONTACTS_SETTING;
globalThis.CommlinkCaller.WELCOME_DISMISSED_SETTING = WELCOME_DISMISSED_SETTING;
globalThis.CommlinkCaller.SOCKET_NAME = SOCKET_NAME;
globalThis.CommlinkCaller.TEMPLATES = TEMPLATES;
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
  return Boolean(game.user?.isGM) && !game.settings.get(MODULE_ID, WELCOME_DISMISSED_SETTING);
}

function openWelcomeScreen({ force = false } = {}) {
  if (!game.user?.isGM) return null;
  if (!force && !shouldShowWelcome()) return null;

  const welcome = getWelcomeScreen() || new WelcomeScreen();
  welcome.render({ force: true });
  welcome.bringToFront?.();

  return welcome;
}

async function placeCall(contactId) {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only GMs can place commlink calls.");
    return null;
  }

  const targetId = getContactId(contactId);
  const contact = getContacts().find((candidate) => candidate.id === targetId);
  const payload = getContactModel().createCallPayload(contact);

  if (!payload) {
    globalThis.ui?.notifications?.warn?.("Unable to place commlink call.");
    return null;
  }

  game.socket.emit(SOCKET_NAME, payload);
  globalThis.ui?.notifications?.info?.(`Calling ${payload.contact.name}.`);

  return payload;
}

async function receiveSocketMessage(payload) {
  if (!payload || payload.type !== "incoming-call") return;
  if (game.user?.isGM) return;

  const normalizedPayload = getContactModel().createCallPayload(payload.contact);
  if (!normalizedPayload) return;

  const contact = normalizedPayload.contact;

  await playRingtone(contact);
  await showIncomingCall(contact);
}

async function playRingtone(contact) {
  if (!contact?.ringtone) return;

  try {
    await foundry.audio.AudioHelper.play({
      src: contact.ringtone,
      volume: contact.volume,
      autoplay: true,
      loop: false
    }, false);
  } catch (error) {
    console.warn("Commlink Caller failed to play ringtone.", error);
  }
}

async function showIncomingCall(contact) {
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.incomingCall, { contact });
  const dialog = new globalThis.CommlinkCaller.DialogV2({
    window: {
      title: "Incoming Commlink Call"
    },
    content,
    buttons: [{
      action: "dismiss",
      label: "Dismiss",
      default: true
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

    await game.settings.set(MODULE_ID, WELCOME_DISMISSED_SETTING, this._hideOnNextLogin);
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
    if (!contactId || typeof globalThis.CommlinkCaller.placeCall !== "function") return;

    await globalThis.CommlinkCaller.placeCall(contactId);
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

  game.settings.register(MODULE_ID, WELCOME_DISMISSED_SETTING, {
    name: "Hide welcome tutorial",
    hint: "Whether this GM has dismissed the Commlink Caller welcome tutorial.",
    scope: "user",
    config: false,
    type: Boolean,
    default: false
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
    visible: game.user?.isGM,
    onChange: () => {
      globalThis.CommlinkCaller.openContactManager();
    }
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, globalThis.CommlinkCaller.receiveSocketMessage);
  globalThis.CommlinkCaller.openWelcomeScreen();
});
