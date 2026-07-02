/**
 * Shared wallet session helpers for dashboard + casino pages.
 * Persists the last connected address and silently restores trusted Phantom/Solflare connections.
 */
(function (global) {
  'use strict';

  var STORAGE_WALLET = 'xapes_wallet_address';
  var STORAGE_VERIFIED = 'xapes_verified_wallet';

  function getSavedWalletAddress() {
    try {
      return localStorage.getItem(STORAGE_WALLET) || null;
    } catch (_) {
      return null;
    }
  }

  function saveWalletAddress(address) {
    if (!address) return;
    try {
      localStorage.setItem(STORAGE_WALLET, address);
    } catch (_) {}
  }

  function clearWalletAddress() {
    try {
      localStorage.removeItem(STORAGE_WALLET);
    } catch (_) {}
  }

  function clearVerifiedWallet() {
    try {
      localStorage.removeItem(STORAGE_VERIFIED);
    } catch (_) {}
  }

  function getSolanaProviders() {
    var out = [];
    if (global.solana && typeof global.solana.connect === 'function') {
      out.push({ name: 'Phantom', provider: global.solana });
    }
    if (global.solflare && typeof global.solflare.connect === 'function') {
      out.push({ name: 'Solflare', provider: global.solflare });
    }
    return out;
  }

  function addressFromProvider(provider) {
    if (!provider || !provider.publicKey) return null;
    try {
      return provider.publicKey.toString();
    } catch (_) {
      return null;
    }
  }

  /** Silently restore a previously authorized wallet on this origin. */
  function restoreTrustedConnection() {
    var providers = getSolanaProviders();
    if (!providers.length) return Promise.resolve(null);

    function tryProvider(index) {
      if (index >= providers.length) return Promise.resolve(null);
      var provider = providers[index].provider;
      var existing = addressFromProvider(provider);
      if (existing) {
        saveWalletAddress(existing);
        return Promise.resolve({ address: existing, provider: provider });
      }
      return provider
        .connect({ onlyIfTrusted: true })
        .then(function (resp) {
          var addr = resp && resp.publicKey ? resp.publicKey.toString() : null;
          if (addr) {
            saveWalletAddress(addr);
            return { address: addr, provider: provider };
          }
          return tryProvider(index + 1);
        })
        .catch(function () {
          return tryProvider(index + 1);
        });
    }

    return tryProvider(0);
  }

  global.XAPES_WALLET = {
    STORAGE_WALLET: STORAGE_WALLET,
    STORAGE_VERIFIED: STORAGE_VERIFIED,
    getSavedWalletAddress: getSavedWalletAddress,
    saveWalletAddress: saveWalletAddress,
    clearWalletAddress: clearWalletAddress,
    clearVerifiedWallet: clearVerifiedWallet,
    clearWalletSession: function () {
      clearWalletAddress();
      clearVerifiedWallet();
    },
    getSolanaProviders: getSolanaProviders,
    restoreTrustedConnection: restoreTrustedConnection,
  };
})(typeof window !== 'undefined' ? window : this);
