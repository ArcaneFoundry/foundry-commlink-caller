import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import "../scripts/contact-model.js";

const contactModel = globalThis.CommlinkCaller.contactModel;

beforeEach(() => {
  globalThis.foundry = {
    utils: {
      randomID: () => "foundry-id"
    }
  };
});

test("normalizeContacts drops invalid and nameless contacts", () => {
  const contacts = contactModel.normalizeContacts([
    null,
    "Vega",
    { name: "   " },
    { id: " alpha ", name: "  Alpha  ", handle: "  @alpha  " },
    { name: "  Beta  " }
  ]);

  assert.deepEqual(contacts, [
    {
      id: "alpha",
      name: "Alpha",
      handle: "@alpha",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 0.8
    },
    {
      id: "foundry-id",
      name: "Beta",
      handle: "",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 0.8
    }
  ]);
});

test("normalizeContacts trims fields and clamps finite volume", () => {
  const contacts = contactModel.normalizeContacts([
    {
      id: "  id-1  ",
      name: "  Echo  ",
      handle: "  channel-7  ",
      portrait: "  echo.webp  ",
      ringtone: "  chirp.ogg  ",
      message: "  Pick up  ",
      volume: 1.5
    },
    {
      name: "Mute",
      volume: -0.25
    }
  ]);

  assert.deepEqual(contacts, [
    {
      id: "id-1",
      name: "Echo",
      handle: "channel-7",
      portrait: "echo.webp",
      ringtone: "chirp.ogg",
      message: "Pick up",
      volume: 1
    },
    {
      id: "foundry-id",
      name: "Mute",
      handle: "",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 0
    }
  ]);
});

test("createContact normalizes input and uses foundry randomID", () => {
  const contact = contactModel.createContact({
    name: "  Zero Cool  ",
    message: "  Ring ring  ",
    volume: Number.POSITIVE_INFINITY
  });

  assert.deepEqual(contact, {
    id: "foundry-id",
    name: "Zero Cool",
    handle: "",
    portrait: "",
    ringtone: "",
    message: "Ring ring",
    volume: 0.8
  });
});

test("createContact falls back to Math.random for ids", () => {
  delete globalThis.foundry;
  const originalRandom = Math.random;
  Math.random = () => 0.123456789;

  try {
    const contact = contactModel.createContact({ name: "  Fallback  " });

    assert.equal(contact.id, "4fzzzxjylrx");
    assert.equal(contact.name, "Fallback");
  } finally {
    Math.random = originalRandom;
  }
});

test("updateContact merges updates and rejects nameless results", () => {
  const current = {
    id: "current",
    name: "Current",
    handle: "old",
    portrait: "",
    ringtone: "",
    message: "Incoming call",
    volume: 0.4
  };

  assert.deepEqual(contactModel.updateContact(current, {
    handle: "  new  ",
    volume: 0.9
  }), {
    id: "current",
    name: "Current",
    handle: "new",
    portrait: "",
    ringtone: "",
    message: "Incoming call",
    volume: 0.9
  });

  assert.equal(contactModel.updateContact(current, { name: "  " }), null);
});

test("removeContact removes matching ids without mutating the input", () => {
  const contacts = [
    { id: "one", name: "One" },
    { id: "two", name: "Two" },
    { id: "three", name: "Three" }
  ];

  const nextContacts = contactModel.removeContact(contacts, "two");

  assert.deepEqual(nextContacts.map((contact) => contact.id), ["one", "three"]);
  assert.deepEqual(contacts.map((contact) => contact.id), ["one", "two", "three"]);
});

test("createCallPayload returns normalized incoming call payload or null", () => {
  assert.deepEqual(contactModel.createCallPayload({
    id: " caller ",
    name: "  Caller  ",
    volume: 2
  }), {
    type: "incoming-call",
    callId: "",
    targetUserId: "",
    targetUserName: "",
    callerUserId: "",
    callerUserName: "",
    contact: {
      id: "caller",
      name: "Caller",
      handle: "",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 1
    }
  });

  assert.deepEqual(contactModel.createCallPayload({
    name: "Caller"
  }, {
    callId: " call-1 ",
    targetUserId: " player-1 ",
    targetUserName: " Raven ",
    callerUserId: " gm ",
    callerUserName: " Gamemaster "
  }), {
    type: "incoming-call",
    callId: "call-1",
    targetUserId: "player-1",
    targetUserName: "Raven",
    callerUserId: "gm",
    callerUserName: "Gamemaster",
    contact: {
      id: "foundry-id",
      name: "Caller",
      handle: "",
      portrait: "",
      ringtone: "",
      message: "Incoming call",
      volume: 0.8
    }
  });

  assert.equal(contactModel.createCallPayload({ name: "  " }), null);
});
