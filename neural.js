(() => {
  'use strict';
  Weebokage.setTheme(localStorage.getItem('theme') || 'miku');
  WeebokageChat.initialize();
  Weebokage.bindAuthNavigation({onChange(user){WeebokageChat.setUser(user);document.getElementById('chat-auth-state').textContent=user?'SIGNED IN // COMPANION READY':'PUBLIC SESSION';}});
  document.getElementById('neural-form').addEventListener('submit',event=>{event.preventDefault();void WeebokageChat.ask();});
  document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById('miku-input');if(input.disabled)return;input.value=button.dataset.prompt;input.focus();}));
})();
