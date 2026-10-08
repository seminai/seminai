const base = require('./package.json').build;
const signing = process.env.SEMINAI_SIGNING === 'true';
const azure = process.env.AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME;
module.exports = {
  ...base,
  forceCodeSigning: signing,
  afterPack: require('./scripts/sign-runtime.cjs'),
  mac: {
    ...base.mac,
    ...(process.env.MACOS_DEVELOPER_ID ? { identity: process.env.MACOS_DEVELOPER_ID } : {}),
    notarize: signing,
  },
  win: {
    ...base.win,
    ...(signing && azure ? {
      signExts: ['.exe', '.dll', '.node'],
      azureSignOptions: {
        endpoint: process.env.AZURE_ARTIFACT_SIGNING_ENDPOINT,
        codeSigningAccountName: azure,
        certificateProfileName: process.env.AZURE_ARTIFACT_SIGNING_CERT_PROFILE_NAME,
      },
    } : {}),
  },
};
