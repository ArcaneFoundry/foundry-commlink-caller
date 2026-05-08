(function attachContactModel(global) {
  const DEFAULT_MESSAGE = "Incoming call";
  const DEFAULT_VOLUME = 0.8;

  function trimString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clampVolume(value) {
    const volume = Number(value);

    if (!Number.isFinite(volume)) return DEFAULT_VOLUME;

    return Math.min(1, Math.max(0, volume));
  }

  function createId() {
    const randomID = global.foundry
      && global.foundry.utils
      && global.foundry.utils.randomID;

    if (typeof randomID === "function") return trimString(randomID());

    return Math.random().toString(36).slice(2, 13);
  }

  function normalizeContact(contact) {
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;

    const name = trimString(contact.name);
    if (!name) return null;

    return {
      id: trimString(contact.id) || createId(),
      name,
      handle: trimString(contact.handle),
      portrait: trimString(contact.portrait),
      ringtone: trimString(contact.ringtone),
      message: trimString(contact.message) || DEFAULT_MESSAGE,
      volume: clampVolume(contact.volume)
    };
  }

  function normalizeContacts(contacts) {
    if (!Array.isArray(contacts)) return [];

    return contacts.map(normalizeContact).filter(Boolean);
  }

  function createContact(contact) {
    return normalizeContact(contact || {});
  }

  function updateContact(contact, updates) {
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;

    return normalizeContact(Object.assign({}, contact, updates || {}));
  }

  function removeContact(contacts, id) {
    if (!Array.isArray(contacts)) return [];

    const targetId = trimString(id);

    return contacts.filter((contact) => {
      if (!contact || typeof contact !== "object" || Array.isArray(contact)) return false;

      return trimString(contact.id) !== targetId;
    });
  }

  function createCallPayload(contact) {
    const normalizedContact = normalizeContact(contact);

    if (!normalizedContact) return null;

    return {
      type: "incoming-call",
      contact: normalizedContact
    };
  }

  const contactModel = {
    createContact,
    normalizeContacts,
    updateContact,
    removeContact,
    createCallPayload
  };

  global.CommlinkCaller = global.CommlinkCaller || {};
  global.CommlinkCaller.contactModel = contactModel;

  if (typeof module === "object" && module.exports) {
    module.exports = contactModel;
  }
})(globalThis);
