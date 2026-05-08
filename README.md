# Commlink Caller

Commlink Caller is a lightweight Foundry VTT v13/v14 community module for GM-run commlink calls.

GMs configure world-level contacts with a name, handle, portrait, ringtone, and message. From the contact manager, the GM can place a one-click call that shows an incoming call prompt to connected players and plays the contact ringtone when browser audio is unlocked.

## Install

Install the module in Foundry with this manifest URL:

```text
https://raw.githubusercontent.com/ArcaneFoundry/foundry-commlink-caller/main/module.json
```

For local development, copy or symlink this repository folder into Foundry's `Data/modules` directory as `foundry-commlink-caller`, then enable **Commlink Caller** in your world.

## Use

1. As the GM, open **Configure Settings** for the world and confirm **Commlink Caller** is enabled.
2. Open the Contact Manager from the scene controls, or from **Configure Settings** > **Commlink contacts**.
3. Add or edit contacts, then save each contact's name, handle, portrait, ringtone, and message.
4. Click **Call** on a saved contact to send an incoming call prompt to connected players.

GMs see a short welcome tutorial the first time the module loads. Leave **Don't show this again on my next login** checked to dismiss it for future logins, or uncheck it before closing to see it again next time. Players never see this welcome screen.

You can also open the Contact Manager from a macro:

```js
CommlinkCaller.openContactManager();
```

Use the file picker buttons beside **Portrait** and **Ringtone** to choose image and audio paths from Foundry's file browser.

## Verify

Run the automated tests:

```bash
npm test
```

For a Foundry smoke test, start a v13 or v14 world with one GM session and at least one connected player session. As the GM, save a contact, click **Call**, and confirm the player sees the incoming call prompt with the configured contact details. Ringtones depend on browser audio unlock policy, so players may need to interact with the Foundry page once before ringtone playback is allowed.

## License

MIT
