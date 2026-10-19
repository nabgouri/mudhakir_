import { Asset } from 'expo-asset';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import pdfAsset from '../../assets/pdfjs/pdf.min.mjs.txt';
import workerAsset from '../../assets/pdfjs/pdf.worker.min.mjs.txt';

import { EXTRACTOR_PAGE } from './extractor-page';

// Reading a Transcript's text on the phone. The student picks the PDF; its
// text is read with pdf.js inside a hidden WebView (./extractor-page.ts),
// since no native PDF text library for React Native is reliable with Arabic.
// The PDF is read from the app's cache and the copy deleted at once: it is
// never uploaded or kept. Only the text goes on, to be split into parts.

export type PickedTranscript =
  | { status: 'picked'; name: string; text: string }
  | { status: 'canceled' }
  // A scanned PDF has pictures of pages, not text.
  | { status: 'no-text'; name: string }
  | { status: 'failed'; error: string };

// A large Transcript takes a while; past this the WebView is assumed stuck.
const TIMEOUT_MS = 3 * 60 * 1000;

type Job = { pdf: string; worker: string; base64: string; resolve: (result: Extracted) => void };
type Extracted = { ok: true; text: string } | { ok: false; error: string };

let sources: Promise<{ pdf: string; worker: string }> | null = null;

// The pdf.js builds, shipped as text assets (scripts/copy-pdfjs.js).
function pdfjsSources() {
  sources ??= (async () => {
    const [pdf, worker] = await Asset.loadAsync([pdfAsset, workerAsset]);
    return { pdf: await new File(pdf.localUri ?? pdf.uri).text(), worker: await new File(worker.localUri ?? worker.uri).text() };
  })();
  sources.catch(() => {
    sources = null;
  });
  return sources;
}

// `pickTranscript` asks for a PDF and resolves with its text. `extractor`
// must be rendered by the screen that calls it: it is the hidden WebView,
// present only while a PDF is being read.
export function useTranscriptPicker() {
  const [job, setJob] = useState<Job | null>(null);
  // `WebView`'s own default type parameter types its props as `never`.
  const webView = useRef<WebView<object>>(null);

  async function pickTranscript(): Promise<PickedTranscript> {
    try {
      const picked = await getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return { status: 'canceled' };
      const { name, uri } = picked.assets[0];
      const copy = new File(uri);
      let base64: string;
      try {
        base64 = await copy.base64();
      } finally {
        try {
          copy.delete();
        } catch {
          // Already gone; the cache is the system's to clear.
        }
      }
      const { pdf, worker } = await pdfjsSources();
      const result = await new Promise<Extracted>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: 'Reading the PDF took too long' }), TIMEOUT_MS);
        setJob({
          pdf,
          worker,
          base64,
          resolve: (extracted) => {
            clearTimeout(timer);
            resolve(extracted);
          },
        });
      });
      setJob(null);
      if (!result.ok) return { status: 'failed', error: result.error };
      return result.text.trim() === '' ? { status: 'no-text', name } : { status: 'picked', name, text: result.text };
    } catch (error) {
      setJob(null);
      return { status: 'failed', error: (error as Error).message };
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    if (job === null) return;
    const message = JSON.parse(event.nativeEvent.data) as { ready: true } | Extracted;
    if ('ready' in message) {
      const call = `extract(${JSON.stringify(job.pdf)}, ${JSON.stringify(job.worker)}, ${JSON.stringify(job.base64)}); true;`;
      webView.current?.injectJavaScript(call);
    } else {
      job.resolve(message);
    }
  }

  const extractor =
    job === null ? null : (
      <View style={styles.hidden} pointerEvents="none">
        <WebView<object>
          ref={webView}
          // A page of its own, so pdf.js can load from blob URLs; nothing
          // is fetched from it.
          source={{ html: EXTRACTOR_PAGE, baseUrl: 'https://mudhakir.invalid/' }}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={onMessage}
          onError={(event) => job.resolve({ ok: false, error: event.nativeEvent.description })}
          onRenderProcessGone={() => job.resolve({ ok: false, error: 'The PDF reader stopped' })}
        />
      </View>
    );

  return { pickTranscript, extractor, reading: job !== null };
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
