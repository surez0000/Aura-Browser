// Proof that the extension's content script ran in the page.
document.title = `${document.title} [ext]`
document.documentElement.setAttribute('data-aura-extension', 'ran')
