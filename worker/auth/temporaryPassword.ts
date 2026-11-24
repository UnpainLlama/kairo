/** 192 bits of randomness, returned once to the administrator at account creation/reset. */
export function createTemporaryPassword():string{const bytes=crypto.getRandomValues(new Uint8Array(24));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,'').replaceAll('+','-').replaceAll('/','_');}
