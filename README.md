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

GMs see a short welcome tutorial when **Show welcome screen** is enabled in Commlink Caller's settings. Leave **Don't show this again on my next login** checked to turn that setting off after the tutorial closes, or uncheck it before closing to see it again next time. Players never see this welcome screen.

Use **Show GM scene-control button** in Commlink Caller's settings to show or hide the GM-only scene-control shortcut.

You can also open the Contact Manager from a macro:

```js
CommlinkCaller.openContactManager();
```

Use the file picker buttons beside **Portrait** and **Ringtone** to choose image and audio paths from Foundry's file browser.

The Ringtone preset menu includes bundled OGG sounds for fantasy or arcane games, gothic horror, western telegraph calls, 1950s switchboard flavor, modern alerts, cyberpunk commlinks, and far-future starship hails. The bundled sounds live in `assets/sounds/ringtones/` and are sourced from Kenney CC0 audio packs; see `assets/sounds/CREDITS.md`.

## Verify

Run the automated tests:

```bash
npm test
```

For a Foundry smoke test, start a v13 or v14 world with one GM session and at least one connected player session. As the GM, save a contact, click **Call**, and confirm the player sees the incoming call prompt with the configured contact details. Ringtones depend on browser audio unlock policy, so players may need to interact with the Foundry page once before ringtone playback is allowed.

## License

MIT
