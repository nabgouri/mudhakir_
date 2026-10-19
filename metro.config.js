// The pdf.js builds in assets/pdfjs/ (scripts/copy-pdfjs.js) are `.txt`
// assets: shipped as files and read as text, never bundled as app code.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('txt');

module.exports = config;
