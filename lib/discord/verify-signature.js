/**
 * Discord Interactions API request signature (Ed25519).
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
const nacl = require('tweetnacl');

function verifyDiscordRequest(rawBodyString, signatureHex, timestamp, clientPublicKeyHex) {
  if (!signatureHex || !timestamp || !clientPublicKeyHex) return false;
  try {
    const msg = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBodyString, 'utf8')]);
    const sig = Buffer.from(signatureHex, 'hex');
    const key = Buffer.from(clientPublicKeyHex, 'hex');
    return nacl.sign.detached.verify(msg, sig, key);
  } catch {
    return false;
  }
}

module.exports = { verifyDiscordRequest };
