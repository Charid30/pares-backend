// src/utils/emailsJetables.js
// Domaines d'adresses e-mail jetables (boîtes temporaires, sans inscription), refusés à l'inscription
// et dans le profil : ils servent à créer des comptes anonymes de test ou d'attaque
// (ex. xalgotest77@mailinator.com, compte « IDOR_TEST_HACKED » d'août 2026).

const DOMAINES_JETABLES = new Set([
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net', '20minutemail.com',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempail.com',
  'tmpmail.org', 'tmpmail.net', 'tmails.net', 'throwawaymail.com', 'trashmail.com', 'trashmail.net',
  'trashmail.de', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'minuteinbox.com', 'mintemail.com', 'mytemp.email',
  'spambox.us', 'spamgourmet.com', 'mailcatch.com', 'mailpoof.com', 'moakt.com', 'burnermail.io',
  'inboxkitten.com', 'emailfake.com', 'fakemail.net', 'getairmail.com', 'discard.email', 'harakirimail.com',
  'mail-temp.com', 'mailtemp.net', 'tempinbox.com', 'jetable.org', 'mail.tm', 'linshiyouxiang.net',
]);

/** L'adresse utilise-t-elle un domaine de messagerie jetable (sous-domaines compris) ? */
const estEmailJetable = (email) => {
  const domaine = String(email || '').trim().toLowerCase().split('@')[1];
  if (!domaine) return false;
  const parties = domaine.split('.');
  for (let i = 0; i < parties.length - 1; i++) {
    if (DOMAINES_JETABLES.has(parties.slice(i).join('.'))) return true;
  }
  return false;
};

module.exports = { estEmailJetable };
