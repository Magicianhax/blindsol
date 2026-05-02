import nacl from "tweetnacl";
import bs58 from "bs58";

const kp = nacl.sign.keyPair();
console.log("PER_DEV_SECRET=" + bs58.encode(kp.secretKey));
console.log("PER_ATTESTATION_PUBKEY=" + bs58.encode(kp.publicKey));
