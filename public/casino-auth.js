/**
 * Phantom wallet auth for casino API calls.
 * Signs: XapeLabz Casino|<action>|<wallet>|<unixTimestamp>
 */
(function (global) {
  'use strict';

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function signCasinoRequest(action, walletAddress) {
    if (!walletAddress) throw new Error('Wallet not connected');
    if (!global.solana || typeof global.solana.signMessage !== 'function') {
      throw new Error('Phantom signMessage is required. Reconnect your wallet.');
    }
    var timestamp = Math.floor(Date.now() / 1000);
    var message = 'XapeLabz Casino|' + action + '|' + walletAddress + '|' + timestamp;
    var encoded = new TextEncoder().encode(message);
    var result = await global.solana.signMessage(encoded, 'utf8');
    var sigBytes = result.signature;
    return {
      walletMessage: message,
      walletSignature: bytesToBase64(sigBytes),
    };
  }

  async function casinoFetch(url, action, walletAddress, body, extraHeaders) {
    var auth = await signCasinoRequest(action, walletAddress);
    var headers = Object.assign(
      { 'Content-Type': 'application/json' },
      extraHeaders || {},
      {
        'x-wallet-message': auth.walletMessage,
        'x-wallet-signature': auth.walletSignature,
      }
    );
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(Object.assign({}, body || {}, {
        walletAddress: body && body.walletAddress ? body.walletAddress : walletAddress,
        userWallet: body && body.userWallet ? body.userWallet : walletAddress,
      })),
    });
  }

  global.CasinoAuth = {
    signCasinoRequest: signCasinoRequest,
    casinoFetch: casinoFetch,
  };
})(typeof window !== 'undefined' ? window : global);
