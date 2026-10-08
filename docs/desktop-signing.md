# Firma degli installer

Seminai può usare una Developer ID Apple e un profilo Azure Artifact Signing già
disponibili al manutentore. Nome dell’app, identificativo e dati di Seminai rimangono
separati; l’identità del firmatario compare nella firma del sistema operativo.
Le credenziali non devono essere inserite nel repository o negli asset.

## macOS locale

Serve una Developer ID Application utilizzabile dal Portachiavi e un profilo `notarytool`
valido. `APPLE_KEYCHAIN` può indicare un Portachiavi dedicato, senza modificare quello
predefinito. La password del Portachiavi o la password specifica Apple non va passata in chat.

```sh
export MACOS_DEVELOPER_ID='Developer ID Application: <identità> (<team>)'
export APPLE_KEYCHAIN_PROFILE='<profilo-notarytool>'
export SEMINAI_SIGNING=true
export DESKTOP_TARGET=mac
node scripts/release/check-desktop-signing.mjs
npm run package --workspace @seminai/desktop
```

Per firmare gli esatti pacchetti macOS di una RC già verificata, scaricare le due ZIP
originali e il relativo `SHA256SUMS.txt` in una cartella, quindi:

```sh
node scripts/release/sign-macos-assets.mjs <cartella-originali> <cartella-output-vuota>
```

Lo script verifica i checksum, firma applicazione e runtime nativi, esercita il database
incluso, invia i DMG ad Apple, controlla `Accepted`, applica i ticket, verifica Gatekeeper
e genera nuove ZIP, DMG, ricevuta e checksum con suffisso `-signed`. I file pubblicati
originali non vengono sovrascritti. Un esito di firma da solo non prova la notarizzazione.

## Windows e CI

Il workflow `desktop-installers` accetta `sign_artifacts=true` per produrre candidati
firmati nell’ambiente GitHub `desktop-signing`. Non li pubblica automaticamente.
Le normali PR restano build senza credenziali; gli artifact firmati hanno nomi separati.

Per Azure configurare queste variabili dell’ambiente:

- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME`
- `AZURE_ARTIFACT_SIGNING_CERT_PROFILE_NAME`

E i secret `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
La credenziale federata deve autorizzare il subject
`repo:seminai/seminai:environment:desktop-signing`. Una configurazione collegata a un altro
repository non autorizza automaticamente Seminai. Limitare il ruolo Signer al profilo
Public Trust scelto; mantenere le protezioni dell’ambiente GitHub.

Electron Builder firma installer ed eseguibili Electron. L’hook aggiuntivo firma anche
gli EXE, DLL e moduli Node nei servizi PostgreSQL/Node inclusi in `extraResources`.
In alternativa ad Azure sono supportati i secret PFX `WINDOWS_CSC_LINK` e
`WINDOWS_CSC_KEY_PASSWORD`.

Per macOS sui runner ospitati usare `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Non esportare automaticamente le chiavi
private del Portachiavi locale.

Una firma valida non garantisce da sola la reputazione SmartScreen né sostituisce il
collaudo su Windows 11 e le policy del computer dell’utente.

Riferimento: [integrazioni ufficiali Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations).
