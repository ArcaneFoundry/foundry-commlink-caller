const MODULE_ID = "foundry-commlink-caller";
const CONTACTS_SETTING = "contacts";
const SOCKET_NAME = `module.${MODULE_ID}`;
const TEMPLATES = Object.freeze({
  manager: `modules/${MODULE_ID}/templates/contact-manager.hbs`
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

  async _saveContact(event) {
    event?.preventDefault();

    const form = event?.currentTarget;
    if (!form) return;

    const formData = new FormData(form);
    const originalId = getFormString(formData, "originalId");
    const formContact = {
      id: getFormString(formData, "id"),
      name: getFormString(formData, "name"),
      handle: getFormString(formData, "handle"),
      portrait: getFormString(formData, "portrait"),
      ringtone: getFormString(formData, "ringtone"),
      message: getFormString(formData, "message"),
      volume: getFormString(formData, "volume")
    };
    const contacts = getContacts();
    const contactModel = getContactModel();
    const existingIndex = originalId
      ? contacts.findIndex((contact) => contact.id === originalId)
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

  game.settings.registerMenu(MODULE_ID, "contactManager", {
    name: "Commlink contacts",
    label: "Manage contacts",
    hint: "Create, edit, and call commlink contacts.",
    icon: "fas fa-address-book",
    restricted: true,
    type: ContactManager
  });
});
