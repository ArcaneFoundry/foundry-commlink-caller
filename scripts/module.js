const MODULE_ID = "foundry-commlink-caller";
const WELCOME_TEMPLATE = `modules/${MODULE_ID}/templates/welcome.hbs`;

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;

  const content = await renderTemplate(WELCOME_TEMPLATE, {
    title: "Commlink Caller",
    subtitle: "Incoming signal tools for cyberpunk tables.",
    moduleId: MODULE_ID,
  });

  new Dialog({
    title: "Commlink Caller",
    content,
    buttons: {
      close: {
        label: "Close",
      },
    },
    default: "close",
  }).render(true);
});
