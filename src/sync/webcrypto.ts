import { digest, getRandomValues, type CryptoDigestAlgorithm } from 'expo-crypto';

// supabase-js hashes the PKCE code verifier with crypto.subtle.digest, and
// without it sends the verifier as the challenge in plain; it also falls back
// to Math.random for the verifier when there is no global crypto. Hermes has
// neither, so give it these two pieces of WebCrypto from expo-crypto. Import
// this before creating the client.
type WebCrypto = {
  getRandomValues?: typeof getRandomValues;
  subtle?: {
    digest(algorithm: string | { name: string }, data: Parameters<typeof digest>[1]): Promise<ArrayBuffer>;
  };
};

const g = globalThis as { crypto?: WebCrypto };
const webCrypto = (g.crypto ??= {});

webCrypto.getRandomValues ??= getRandomValues;
webCrypto.subtle ??= {
  // CryptoDigestAlgorithm's values are the WebCrypto names ('SHA-256', …).
  digest: (algorithm, data) =>
    digest((typeof algorithm === 'string' ? algorithm : algorithm.name) as CryptoDigestAlgorithm, data),
};
