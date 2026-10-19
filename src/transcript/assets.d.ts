// A `.txt` file is a Metro asset (metro.config.js): importing it gives its
// asset id, for expo-asset to load.
declare module '*.txt' {
  const asset: number;
  export default asset;
}
