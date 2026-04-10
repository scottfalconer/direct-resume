import { createPairingToken, ensureLocalConfig } from "./stores/local-config.js";

const { storeDir, config } = await ensureLocalConfig();
const pairing = await createPairingToken();

console.log("Direct Resume setup");
console.log("");
console.log(`Store: ${storeDir}`);
console.log(`Machine ID: ${config.machine_id}`);
console.log("");
console.log("1. Start the companion:");
console.log("   npm start");
console.log("");
console.log("2. Load the unpacked extension from:");
console.log("   extension");
console.log("");
console.log("3. When the extension asks for a pairing token, paste:");
console.log(`   ${pairing.token}`);
console.log("");
console.log(`The token expires at ${pairing.expiresAt} and can be used once.`);
