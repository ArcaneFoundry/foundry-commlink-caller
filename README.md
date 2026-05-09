# Commlink Caller

Commlink Caller is a lightweight Foundry VTT v13/v14 community module for GM-run commlink calls.

GMs configure world-level contacts with a name, handle, portrait, and message. From the contact manager, the GM can call all players, selected players, or themself for testing. The recipient sees an incoming commlink prompt with a phone frame, contact portrait, caller details, ringtone selector, and answer/dismiss controls while their chosen ringtone plays when browser audio is unlocked.

## Install

Install the module in Foundry with this manifest URL:

```text
https://github.com/ArcaneFoundry/foundry-commlink-caller/releases/latest/download/module.json
```

In Foundry's setup screen, open **Add-on Modules**, choose **Install Module**, paste the manifest URL above, then click **Install**. Foundry will fetch the release manifest and download the matching module zip.

For local development, copy or symlink this repository folder into Foundry's `Data/modules` directory as `foundry-commlink-caller`, then enable **Commlink Caller** in your world.

## Use

1. As the GM, open **Configure Settings** for the world and confirm **Commlink Caller** is enabled.
2. Open the Contact Manager from the scene controls, or from **Configure Settings** > **Commlink contacts**.
3. Add or edit contacts, then save each contact's name, handle, portrait, message, and call volume.
4. Choose one or more recipients from the pill selector above the contact list. **Select players** toggles player recipients only; the GM test recipient is selected manually.
5. Click **Call** on a saved contact to ring the selected recipients and show the incoming commlink screen.
6. Watch Foundry notifications for ringing, answered, or dismissed status.

GMs see a short welcome tutorial when **Show welcome screen** is enabled in Commlink Caller's settings. Leave **Don't show this again on my next login** checked to turn that setting off after the tutorial closes, or uncheck it before closing to see it again next time. Players never see this welcome screen.

Use **Show GM scene-control button** in Commlink Caller's settings to show or hide the GM-only scene-control shortcut.

Players can use Commlink Caller's settings, or the selector on the incoming phone, to choose the ringtone that plays when their own commlink receives a call. They can also choose a preferred phone frame in settings.

You can also open the Contact Manager from a macro:

```js
CommlinkCaller.openContactManager();
```

Use the file picker button beside **Portrait** to choose an image path from Foundry's file browser.

The bundled ringtone menu includes OGG sounds for fantasy or arcane games, gothic horror, western telegraph calls, 1950s switchboard flavor, modern alerts, cyberpunk commlinks, classic mobile calls, and far-future starship hails. The bundled sounds live in `assets/sounds/ringtones/` and are sourced from CC0 audio; see `assets/sounds/CREDITS.md`.

## Verify

Run the automated tests:

```bash
npm test
```

For a Foundry smoke test, start a v13 or v14 world with one GM session and at least one connected player session. As the GM, save a contact, click **Call**, and confirm the player sees the incoming call prompt with the configured contact details. Ringtones depend on browser audio unlock policy, so players may need to interact with the Foundry page once before ringtone playback is allowed.

## License

MIT
