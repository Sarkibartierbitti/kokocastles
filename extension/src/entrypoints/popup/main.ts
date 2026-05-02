document.getElementById('open')?.addEventListener('click', async () => {
  const sidebarAction = (browser as unknown as { sidebarAction?: { open: () => Promise<void> } }).sidebarAction;
  if (sidebarAction?.open) {
    await sidebarAction.open();
    window.close();
  }
});
