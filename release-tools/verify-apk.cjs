const fs=require('fs'),crypto=require('crypto'),assert=require('assert'),{Buffer}=require('buffer');
const file=process.argv[2],apk=fs.readFileSync(file);
let e=apk.lastIndexOf(Buffer.from('504b0506','hex'));assert(e>=0);
const cd=apk.readUInt32LE(e+16);assert.equal(cd+apk.readUInt32LE(e+12),e);assert.equal(e+22+apk.readUInt16LE(e+20),apk.length);
assert.equal(apk.subarray(cd-16,cd).toString(),'APK Sig Block 42');
let size=Number(apk.readBigUInt64LE(cd-24)),start=cd-size-8;assert.equal(Number(apk.readBigUInt64LE(start)),size);
let off=start+8,v2;
while(off<cd-24){let len=Number(apk.readBigUInt64LE(off));off+=8;let id=apk.readUInt32LE(off);if(id===0x7109871a)v2=apk.subarray(off+4,off+len);off+=len;}
assert(v2);
function read(buf){let i=0;return ()=>{let n=buf.readUInt32LE(i);i+=4;let out=buf.subarray(i,i+n);assert.equal(out.length,n);i+=n;return out;};}
const signer=read(read(v2)())();const fields=read(signer);const signed=fields(),signatures=fields(),pubkey=fields();
const signedFields=read(signed);const digests=signedFields(),certificates=signedFields();signedFields();
const cert=new crypto.X509Certificate(read(certificates)());
assert.equal(cert.fingerprint256.replaceAll(':','').toLowerCase(),'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c');
assert(cert.publicKey.export({format:'der',type:'spki'}).equals(pubkey));
const sig=read(signatures)();assert.equal(sig.readUInt32LE(0),0x103);const signature=read(sig.subarray(4))();
assert(crypto.verify('sha256',signed,{key:cert.publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},signature));
const dig=read(digests)();assert.equal(dig.readUInt32LE(0),0x103);const stored=read(dig.subarray(4))();
let end=Buffer.from(apk.subarray(e));end.writeUInt32LE(start,16);
const hashes=[];const int=n=>{let b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
for(const section of [apk.subarray(0,start),apk.subarray(cd,e),end])for(let i=0;i<section.length;i+=1048576){const chunk=section.subarray(i,i+1048576);hashes.push(crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0xa5]),int(chunk.length),chunk])).digest());}
const digest=crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0x5a]),int(hashes.length),...hashes])).digest();assert(digest.equals(stored));
console.log('Verified v2 RSA signature, certificate continuity, APK content digest, and signing-block/ZIP offsets:',file);
