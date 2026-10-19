// Tests run on Makkah time, so local calendar days and the published prayer
// times in the study-engine tests line up wherever the tests run.
module.exports = () => {
  process.env.TZ = 'Asia/Riyadh';
};
