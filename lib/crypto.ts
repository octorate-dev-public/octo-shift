/**
 * Cifratura/decifratura AES-256-GCM per credenziali sensibili.
 *
 * Chiave: variabile d'ambiente KEROS_ENCRYPTION_KEY
 *   → stringa hex di 64 caratteri (= 32 byte / 256 bit)
 *   → generala con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Formato del ciphertext salvato su DB: "ivHex:authTagHex:dataHex"
 *   - iv       = 16 byte random (nuovo ad ogni cifratura)
 *   - authTag  = 16 byte GCM authentication tag (garantisce integrità)
 *   - data     = ciphertext
 *
 * Se KEROS_ENCRYPTION_KEY non è configurata, encrypt/decrypt lanciano un'eccezione
 * con un messaggio chiaro anziché silenziosamente non cifrare.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const SEPARATOR = ':';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY non configurata. ' +
      'Genera una chiave con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
      'e aggiungila alle variabili d\'ambiente.',
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY deve essere esattamente 64 caratteri hex (32 byte). ` +
      `Trovati ${hex.length} caratteri.`,
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Cifra un valore in chiaro.
 * Ogni chiamata produce un ciphertext diverso (IV random).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(SEPARATOR);
}

/**
 * Decifra un valore prodotto da `encrypt()`.
 * Verifica l'autenticità tramite GCM authTag — lancia se il dato è stato manomesso.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(SEPARATOR);

  if (parts.length !== 3) {
    throw new Error('Formato ciphertext non valido (atteso: iv:authTag:data).');
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const iv      = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data    = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Ritorna true se il valore sembra già cifrato nel formato atteso.
 * Utile per evitare doppia cifratura.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(SEPARATOR);
  return (
    parts.length === 3 &&
    /^[0-9a-f]{32}$/.test(parts[0]) &&  // IV: 16 byte hex
    /^[0-9a-f]{32}$/.test(parts[1])     // authTag: 16 byte hex
  );
}
