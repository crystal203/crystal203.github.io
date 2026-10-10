"""Refresh the static site's content cache version using only Python's stdlib."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
folders=['apps','core','gtatlas','gtasset','gtfx','gtmap','resources','shared','vendor']
files=[ROOT/name for name in ['index.html','library.js','library.css','sw.js']]
for folder in folders:files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and p!=ROOT/'core/cache-version.js')
digest=hashlib.sha256()
for file in sorted(files,key=lambda p:p.relative_to(ROOT).as_posix()):
 digest.update(file.relative_to(ROOT).as_posix().encode()+b'\0')
 content=hashlib.sha256()
 with file.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):content.update(chunk)
 digest.update(content.digest())
version=digest.hexdigest()[:20]
(ROOT/'core/cache-version.js').write_text("/* Generated content cache version; do not edit. */\nself.GT_CACHE_VERSION = '"+version+"';\n",encoding='utf-8',newline='\n')
print('Updated static cache version:',version)
