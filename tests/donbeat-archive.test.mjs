import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {File} from 'node:buffer';
import {readFileSync,openSync,readSync,closeSync,unlinkSync,writeSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

// Minimal ZIP with both compression methods, CRC and a data descriptor.
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1}return (crc^0xffffffff)>>>0}
function zip(entries){const local=[],central=[];let cursor=0;
 for(const [path,data,method,descriptor=false] of entries){const name=Buffer.from(path),raw=Buffer.from(data),payload=method===8?deflateRawSync(raw):raw,checksum=crc32(raw),lh=Buffer.alloc(30),ch=Buffer.alloc(46);
  lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(descriptor?8:0,6);lh.writeUInt16LE(method,8);lh.writeUInt32LE(descriptor?0:checksum,14);lh.writeUInt32LE(descriptor?0:payload.length,18);lh.writeUInt32LE(descriptor?0:raw.length,22);lh.writeUInt16LE(name.length,26);
  const desc=descriptor?Buffer.alloc(16):Buffer.alloc(0);if(descriptor){desc.writeUInt32LE(0x08074b50,0);desc.writeUInt32LE(checksum,4);desc.writeUInt32LE(payload.length,8);desc.writeUInt32LE(raw.length,12)}
  local.push(lh,name,payload,desc);
  ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(descriptor?8:0,8);ch.writeUInt16LE(method,10);ch.writeUInt32LE(checksum,16);ch.writeUInt32LE(payload.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(cursor,42);central.push(ch,name);cursor+=lh.length+name.length+payload.length+desc.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(cursor,16);
 return {local:Buffer.concat(local),directory,end};
}
function reader(){const c=vm.createContext({File,Blob,TextDecoder,DecompressionStream});vm.runInContext(readFileSync(new URL('../public/donbeat/malody.js',import.meta.url),'utf8'),c);return c}
test('local ZIP imports a dan file and multiple charts and audio, including deflate and data descriptors',async()=>{
 const c=reader(),contents=[['段位/course.dan','TITLE:メドレー\nSONG1:A\nEXAM1:80,100',8,true],['段位/A.tja','TITLE:A\n#START\n1000,\n#END',8],['段位/A.ogg','audio-1',0],['段位/B.ogg','audio-2',8]];
 const z=zip(contents),f=new File([z.local,z.directory,z.end],'pack.zip');c.input=f;
 const files=await vm.runInContext('readChartArchive(input)',c);
 assert.equal(files.length,4);assert.equal(files[0].chartPath,'段位/course.dan');
 for(let i=0;i<contents.length;i++)assert.equal(await files[i].text(),contents[i][1]);
});
test('imports a sparse archive larger than the old 256MB limit without reading it into memory',async()=>{
 const c=reader(),z=zip([['medley.dan','TITLE:test\nSONG1:A\nEXAM1:80,100',8]]),dirOffset=300*1024*1024,footer=Buffer.from(z.end);footer.writeUInt32LE(dirOffset,16);
 const path=join(tmpdir(),'donbeat-large-zip-'+randomUUID()),fd=openSync(path,'w+');
 try{
  writeSync(fd,z.local,0,z.local.length,0);writeSync(fd,z.directory,0,z.directory.length,dirOffset);writeSync(fd,footer,0,footer.length,dirOffset+z.directory.length);
  c.input={size:dirOffset+z.directory.length+footer.length,slice(start,end=this.size){const length=end-start,b=Buffer.alloc(length);readSync(fd,b,0,length,start);return new Blob([b])}};
  const files=await vm.runInContext('readChartArchive(input)',c);assert.equal(files.length,1);assert.match(await files[0].text(),/TITLE:test/);
 }finally{closeSync(fd);unlinkSync(path)}
});
test('rejects archives above 1GB and entries above 256MB before decompression',async()=>{
 const c=reader();c.input={size:1024**3+1};await assert.rejects(vm.runInContext('readChartArchive(input)',c),/1GB/);
 const z=zip([['medley.dan','TITLE:test',0]]),directory=Buffer.from(z.directory);directory.writeUInt32LE(256*1024**2+1,24);
 c.input=new File([z.local,directory,z.end],'bad.zip');await assert.rejects(vm.runInContext('readChartArchive(input)',c),/256MB/);
});
