"""APK v2 signing per Android's published APK Signature Scheme v2 format."""
import argparse, struct, hashlib, pathlib
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PublicFormat
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
parser=argparse.ArgumentParser()
parser.add_argument('unsigned_apk', type=pathlib.Path)
parser.add_argument('output_apk', type=pathlib.Path)
parser.add_argument('signing_p12', type=pathlib.Path)
args=parser.parse_args()
raw=args.unsigned_apk.read_bytes()
eocd=raw.rfind(b'PK\x05\x06'); assert eocd>=0
cd=struct.unpack_from('<I',raw,eocd+16)[0]
assert cd+struct.unpack_from('<I',raw,eocd+12)[0]==eocd
assert eocd+22+struct.unpack_from('<H',raw,eocd+20)[0]==len(raw)
u32=lambda x:struct.pack('<I',x)
u64=lambda x:struct.pack('<Q',x)
lp=lambda x:u32(len(x))+x
chunks=[]
for section in (raw[:cd],raw[cd:eocd],raw[eocd:]):
 for start in range(0,len(section),1024*1024):
  part=section[start:start+1024*1024];chunks.append(hashlib.sha256(b'\xa5'+u32(len(part))+part).digest())
digest=hashlib.sha256(b'\x5a'+u32(len(chunks))+b''.join(chunks)).digest()
key,cert,_=pkcs12.load_key_and_certificates(args.signing_p12.read_bytes(),b'android')
assert cert.fingerprint(hashes.SHA256()).hex()=='fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'
signed=lp(lp(u32(0x0103)+lp(digest)))+lp(lp(cert.public_bytes(Encoding.DER)))+lp(b'')
signature=key.sign(signed,padding.PKCS1v15(),hashes.SHA256())
signer=lp(signed)+lp(lp(u32(0x0103)+lp(signature)))+lp(key.public_key().public_bytes(Encoding.DER,PublicFormat.SubjectPublicKeyInfo))
value=lp(lp(signer)); pair=u64(4+len(value))+u32(0x7109871a)+value
size=len(pair)+24;block=u64(size)+pair+u64(size)+b'APK Sig Block 42'
end=bytearray(raw[eocd:]);struct.pack_into('<I',end,16,cd+len(block))
output=raw[:cd]+block+raw[cd:eocd]+end
args.output_apk.write_bytes(output)
print('Signed APK v2 with matching upgrade certificate. SHA256:',hashlib.sha256(output).hexdigest())
